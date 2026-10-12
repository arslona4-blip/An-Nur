"use client";

import { Maximize } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type DisplayState, lastDisplay, subscribeDisplay } from "@/lib/customerDisplay";
import { methodLabel, som } from "@/lib/format";

const DONE_MS = 15000;

function qtyText(qty: number, unit: string) {
  const shown = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return unit === "dona" ? `${shown} ta` : `${shown} ${unit}`;
}

export function CustomerDisplay({ storeName, footer }: { storeName: string; footer: string }) {
  const [state, setState] = useState<DisplayState | null>(null);
  const [full, setFull] = useState(false);
  const [clock, setClock] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const last = lastDisplay();
    if (last && Date.now() - last.at < 10 * 60000) setState(last);
    return subscribeDisplay(setState);
  }, []);

  useEffect(() => {
    if (state?.mode !== "done") return;
    const t = setTimeout(() => setState((s) => (s?.mode === "done" ? { ...s, mode: "idle", lines: [] } : s)), DONE_MS);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [state?.lines.length]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("uz-UZ", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 15000);
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      clearInterval(t);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, []);

  const mode = state?.mode || "idle";
  const showCart = (mode === "cart" || mode === "pay") && state && state.lines.length > 0;

  return (
    <div className="flex h-dvh flex-col bg-gradient-to-br from-brand to-brand-dark text-white select-none">
      <header className="flex items-center justify-between px-8 py-5">
        <div className="text-3xl font-extrabold tracking-tight">{storeName}</div>
        <div className="flex items-center gap-4">
          <div className="text-2xl font-semibold num opacity-80">{clock}</div>
          {!full ? (
            <button
              onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
              className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
            >
              <Maximize size={16} />
              To‘liq ekran
            </button>
          ) : null}
        </div>
      </header>

      {showCart ? (
        <main className="flex min-h-0 flex-1 gap-6 px-8 pb-8">
          <section className="flex min-h-0 flex-1 flex-col rounded-3xl bg-white text-ink shadow-xl">
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-line px-6 py-3 text-sm font-semibold uppercase tracking-wide text-muted">
              <span>Mahsulot</span>
              <span className="w-32 text-right">Miqdor</span>
              <span className="w-44 text-right">Summa</span>
            </div>
            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
              {state.lines.map((l, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-line px-6 py-4 last:border-0 ${
                    i === state.lines.length - 1 ? "bg-emerald-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-2xl font-semibold">{l.name}</div>
                    <div className="text-base text-muted num">{som(l.price)}</div>
                  </div>
                  <div className="w-32 text-right text-2xl num">{qtyText(l.qty, l.unit)}</div>
                  <div className="w-44 text-right text-2xl font-bold num">{som(l.total)}</div>
                </div>
              ))}
            </div>
          </section>
          <aside className="flex w-[36%] max-w-md flex-col justify-end gap-4">
            {state.discount > 0 ? (
              <div className="rounded-3xl bg-white/10 px-6 py-4">
                <div className="flex justify-between text-xl opacity-80">
                  <span>Jami</span>
                  <span className="num">{som(state.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xl text-amber-200">
                  <span>Chegirma</span>
                  <span className="num">−{som(state.discount)}</span>
                </div>
              </div>
            ) : null}
            {mode === "pay" && state.method === "naqd" && state.paid > 0 ? (
              <div className="rounded-3xl bg-white/10 px-6 py-4 text-xl">
                <div className="flex justify-between">
                  <span className="opacity-80">Berilgan pul</span>
                  <span className="num">{som(state.paid)}</span>
                </div>
                {state.paid >= state.total ? (
                  <div className="flex justify-between font-bold text-amber-200">
                    <span>Qaytim</span>
                    <span className="num">{som(state.paid - state.total)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-3xl bg-white px-6 py-6 text-ink shadow-xl">
              <div className="text-lg font-semibold uppercase tracking-wide text-muted">
                {mode === "pay" ? `To‘lov · ${methodLabel(state.method)}` : "To‘lanadi"}
              </div>
              <div className="mt-1 whitespace-nowrap text-4xl font-extrabold text-brand num leading-tight xl:text-5xl 2xl:text-6xl">
                {som(state.total)}
              </div>
              <div className="mt-2 text-base text-muted">{state.lines.length} xil mahsulot</div>
            </div>
          </aside>
        </main>
      ) : mode === "done" && state ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-6 pb-16 text-center">
          <div className="text-7xl font-extrabold">Rahmat!</div>
          <div className="text-3xl opacity-90">Xaridingiz uchun tashakkur</div>
          <div className="mt-4 rounded-3xl bg-white px-12 py-6 text-ink shadow-xl">
            <div className="text-lg uppercase tracking-wide text-muted">To‘landi</div>
            <div className="text-6xl font-extrabold text-brand num">{som(state.total)}</div>
            {state.change > 0 ? (
              <div className="mt-2 text-3xl font-bold text-amber-600 num">Qaytim: {som(state.change)}</div>
            ) : null}
          </div>
          {footer ? <div className="text-xl opacity-80">{footer}</div> : null}
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 pb-16 text-center">
          <div className="text-6xl font-extrabold">Xush kelibsiz!</div>
          <div className="text-3xl opacity-80">{storeName}</div>
          {footer ? <div className="mt-6 text-xl opacity-70">{footer}</div> : null}
        </main>
      )}
    </div>
  );
}
