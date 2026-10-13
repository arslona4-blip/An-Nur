"use client";

import Link from "next/link";
import { Copy, Printer, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/client";
import { som } from "@/lib/format";

type Item = { id: number; name: string; unit: string; stock: number; min_stock: number; per_day: number; buy_price: number; qty: number };
type Group = { supplier: { id: number; name: string; phone: string | null } | null; items: Item[] };

const groupKey = (g: Group) => String(g.supplier?.id || 0);

function waPhone(phone: string | null) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 9) return `998${d}`;
  return d.length >= 11 ? d : "";
}

export function OrderScreen() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [off, setOff] = useState<Record<number, boolean>>({});
  const [store, setStore] = useState({ name: "", phone: "" });
  const [printKey, setPrintKey] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ groups: Group[] }>("/api/stock/reorder"),
      api<{ settings: Record<string, string> }>("/api/settings"),
    ])
      .then(([r, s]) => {
        setGroups(r.groups);
        setQty(Object.fromEntries(r.groups.flatMap((g) => g.items.map((i) => [i.id, String(i.qty)]))));
        setStore({ name: s.settings.store_name || "", phone: s.settings.store_phone || "" });
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!printKey) return;
    const done = () => setPrintKey(null);
    window.addEventListener("afterprint", done);
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printKey]);

  const chosen = (g: Group) =>
    g.items.filter((i) => !off[i.id] && Number(qty[i.id]) > 0).map((i) => ({ ...i, qty: Number(qty[i.id]) }));

  function orderText(g: Group) {
    const lines = chosen(g).map((i, n) => `${n + 1}. ${i.name} — ${i.qty} ${i.unit}`);
    return [
      "Assalomu alaykum!",
      `${store.name || "Do'kon"} uchun buyurtma:`,
      "",
      ...lines,
      "",
      store.phone ? `Aloqa: ${store.phone}` : "",
    ]
      .filter((l, i, a) => l || (i > 0 && a[i - 1]))
      .join("\n")
      .trim();
  }

  async function copy(g: Group) {
    try {
      await navigator.clipboard.writeText(orderText(g));
      setMsg("Buyurtma matni nusxalandi");
    } catch {
      setMsg("Nusxalab bo‘lmadi");
    }
  }

  function shareTelegram(g: Group) {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(orderText(g))}`, "_blank");
  }

  function shareWhatsApp(g: Group) {
    window.open(`https://wa.me/${waPhone(g.supplier?.phone || null)}?text=${encodeURIComponent(orderText(g))}`, "_blank");
  }

  const today = new Date().toLocaleDateString("uz-UZ");

  return (
    <div className="print-area space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Ta’minotchiga buyurtma</h1>
          <p className="text-sm text-muted">
            Kam qolgan va tez sotilayotgan mahsulotlar. Miqdor: taxminan 7 kunlik savdo yoki minimal qoldiqning 2 baravari.
          </p>
        </div>
        <Link href="/ombor" className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold">
          Kirim qilish
        </Link>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      {msg ? <div className="no-print text-sm text-ok">{msg}</div> : null}
      {groups === null ? <div className="text-sm text-muted">Yuklanmoqda...</div> : null}
      {groups?.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">Hozircha buyurtma kerak emas — hamma mahsulot yetarli.</Card>
      ) : null}
      {groups?.map((g) => {
        const key = groupKey(g);
        const list = chosen(g);
        const sum = list.reduce((s, i) => s + Math.round(i.qty * i.buy_price), 0);
        return (
          <Card key={key} className={`overflow-hidden ${printKey && printKey !== key ? "print:hidden" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg px-4 py-3">
              <div>
                <div className="font-bold">{g.supplier?.name || "Ta’minotchisi noma’lum"}</div>
                <div className="text-xs text-muted">
                  {g.supplier?.phone || (g.supplier ? "telefon yo‘q" : "Bu mahsulotlar hali kirim qilinmagan")}
                  <span className="hidden print:inline"> · {store.name} · {today}</span>
                </div>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                <Button variant="ghost" disabled={!list.length} onClick={() => setPrintKey(key)}>
                  <Printer size={15} />
                  Chop etish
                </Button>
                <Button variant="ghost" disabled={!list.length} onClick={() => copy(g)}>
                  <Copy size={15} />
                  Nusxa
                </Button>
                <Button variant="ghost" disabled={!list.length} onClick={() => shareTelegram(g)}>
                  <Send size={15} />
                  Telegram
                </Button>
                {waPhone(g.supplier?.phone || null) ? (
                  <Button variant="ghost" disabled={!list.length} onClick={() => shareWhatsApp(g)}>
                    WhatsApp
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="no-print w-8 px-4 py-2"></th>
                    <th className="px-4 py-2 font-medium">Mahsulot</th>
                    <th className="no-print whitespace-nowrap px-4 py-2 font-medium">Qoldiq</th>
                    <th className="no-print whitespace-nowrap px-4 py-2 font-medium">Kunlik sotuv</th>
                    <th className="whitespace-nowrap px-4 py-2 font-medium">Buyurtma</th>
                    <th className="no-print whitespace-nowrap px-4 py-2 text-right font-medium">Taxminiy summa</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((i) => {
                    const skip = !!off[i.id] || !(Number(qty[i.id]) > 0);
                    return (
                      <tr key={i.id} className={`border-t border-line ${skip ? "text-muted print:hidden" : ""}`}>
                        <td className="no-print px-4 py-2">
                          <input
                            type="checkbox"
                            checked={!off[i.id]}
                            onChange={(e) => setOff({ ...off, [i.id]: !e.target.checked })}
                            aria-label={i.name}
                          />
                        </td>
                        <td className="px-4 py-2 font-medium">{i.name}</td>
                        <td className={`no-print whitespace-nowrap px-4 py-2 num ${i.stock <= i.min_stock ? "text-danger font-semibold" : ""}`}>
                          {i.stock} {i.unit}
                          {i.min_stock ? <span className="text-xs text-muted"> / min {i.min_stock}</span> : null}
                        </td>
                        <td className="no-print whitespace-nowrap px-4 py-2 num">{i.per_day ? `${i.per_day} ${i.unit}` : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <div className="flex items-center gap-1.5">
                            <div className="w-24 print:hidden">
                              <Input
                                type="number"
                                min="0"
                                step={i.unit === "dona" ? "1" : "0.5"}
                                value={qty[i.id] ?? ""}
                                onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
                              />
                            </div>
                            <span className="hidden font-semibold num print:inline">{qty[i.id]}</span>
                            <span className="text-xs text-muted">{i.unit}</span>
                          </div>
                        </td>
                        <td className="no-print whitespace-nowrap px-4 py-2 text-right num">
                          {i.buy_price ? som(Math.round(Number(qty[i.id] || 0) * i.buy_price)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="no-print flex justify-between border-t border-line px-4 py-2 text-sm">
              <span className="text-muted">{list.length} xil mahsulot</span>
              <span className="font-bold num">≈ {som(sum)}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
