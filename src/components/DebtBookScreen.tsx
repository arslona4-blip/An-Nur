"use client";

import Link from "next/link";
import { MessageSquare, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { methodLabel, som, tashkentDateTime } from "@/lib/format";

type Customer = { id: number; name: string; phone: string | null; address: string | null; debt: number };
type History = {
  sales: Array<{ number: string; total: number; payment_method: string; created_at: string }>;
  payments: Array<{ amount: number; created_at: string }>;
};

export function DebtBookScreen() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [payFor, setPayFor] = useState<Customer | null>(null);
  const [amount, setAmount] = useState("");
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await api<{ customers: Customer[] }>("/api/customers");
    setCustomers(d.customers);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  const debtors = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers
      .filter((c) => (c.debt || 0) > 0)
      .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.phone || "").includes(needle))
      .sort((a, b) => b.debt - a.debt);
  }, [customers, q]);

  const totalDebt = customers.reduce((s, c) => s + Math.max(0, c.debt || 0), 0);
  const debtorCount = customers.filter((c) => (c.debt || 0) > 0).length;

  function openPay(c: Customer) {
    setPayFor(c);
    setAmount(String(c.debt));
    setError("");
  }

  async function pay() {
    if (!payFor) return;
    setBusy(true);
    setError("");
    try {
      const paid = Math.round(Number(amount));
      await api("/api/customers", { method: "POST", body: JSON.stringify({ action: "pay", id: payFor.id, amount: paid }) });
      setNotice(
        paid >= payFor.debt
          ? `${payFor.name}: qarz to‘liq yopildi`
          : `${payFor.name}: ${som(paid)} qabul qilindi, ${som(payFor.debt - paid)} qoldi`,
      );
      setPayFor(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function sendSms(c: Customer) {
    setError("");
    try {
      await api("/api/sms", { method: "POST", body: JSON.stringify({ action: "debt", phone: c.phone, name: c.name, debt: c.debt }) });
      setNotice(`${c.name}ga SMS yuborildi`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SMS yuborilmadi");
    }
  }

  async function openHistory(c: Customer) {
    setHistoryFor(c);
    setHistory(null);
    try {
      setHistory(await api<History>(`/api/customers?id=${c.id}&action=history`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  const half = payFor ? Math.round(payFor.debt / 2 / 1000) * 1000 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Qarz daftari</h1>
          <p className="text-sm text-muted">Kim qancha qarz — bir qarashda</p>
        </div>
        <Link href="/mijozlar" className="text-sm font-semibold text-brand underline">
          Barcha mijozlar
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Jami qarz</div>
          <div className="mt-1 text-2xl font-extrabold text-danger num">{som(totalDebt)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Qarzdorlar</div>
          <div className="mt-1 text-2xl font-extrabold">{debtorCount} kishi</div>
        </Card>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 text-muted" size={18} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki telefon..." className="h-12 pl-10" />
      </div>

      {notice ? (
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-ok" onClick={() => setNotice("")}>
          {notice}
        </div>
      ) : null}
      {error && !payFor ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}

      {debtors.length === 0 ? (
        <Card className="p-8 text-center text-muted">
          {q ? "Topilmadi" : "Hech kimda qarz yo‘q. Qarzga sotish uchun kassada mijozni tanlab, “Qarz” bilan to‘lang."}
        </Card>
      ) : (
        <div className="space-y-2">
          {debtors.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <button className="min-w-0 flex-1 text-left" onClick={() => openHistory(c)}>
                <div className="truncate text-lg font-bold">{c.name}</div>
                <div className="text-sm text-muted">{c.phone || "telefon yo‘q"}</div>
              </button>
              <div className="text-right">
                <div className="text-xl font-extrabold text-danger num">{som(c.debt)}</div>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                {c.phone ? (
                  <>
                    <a
                      href={`tel:${c.phone}`}
                      className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-brand"
                      aria-label="Qo‘ng‘iroq"
                    >
                      <Phone size={18} />
                    </a>
                    <button
                      onClick={() => sendSms(c)}
                      className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white text-brand"
                      aria-label="SMS eslatma"
                      title="SMS eslatma"
                    >
                      <MessageSquare size={18} />
                    </button>
                  </>
                ) : null}
                <Button className="h-11 flex-1 sm:flex-none" onClick={() => openPay(c)}>
                  To‘lov olish
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!payFor} title={`${payFor?.name || ""} — to‘lov`} onClose={() => setPayFor(null)}>
        {payFor ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              pay();
            }}
          >
            <div className="text-sm text-muted">
              Qarzi: <b className="text-lg text-danger num">{som(payFor.debt)}</b>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAmount(String(payFor.debt))}
                className={`rounded-xl border px-3 py-3 text-sm font-bold ${
                  Number(amount) === payFor.debt ? "border-brand bg-brand text-white" : "border-line"
                }`}
              >
                Hammasini yopish
              </button>
              {half > 0 && half < payFor.debt ? (
                <button
                  type="button"
                  onClick={() => setAmount(String(half))}
                  className={`rounded-xl border px-3 py-3 text-sm font-bold num ${
                    Number(amount) === half ? "border-brand bg-brand text-white" : "border-line"
                  }`}
                >
                  Yarmi: {som(half)}
                </button>
              ) : null}
            </div>
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Olingan summa"
              className="h-14 text-2xl font-bold"
            />
            {Number(amount) > 0 && Number(amount) < payFor.debt ? (
              <div className="text-sm text-muted">
                Qoladi: <b className="num text-ink">{som(payFor.debt - Number(amount))}</b>
              </div>
            ) : null}
            {error ? <div className="text-sm text-danger">{error}</div> : null}
            <Button
              type="submit"
              className="h-12 w-full text-base"
              disabled={busy || !(Number(amount) > 0) || Number(amount) > payFor.debt}
            >
              {busy ? "Saqlanmoqda..." : "Qabul qilish"}
            </Button>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!historyFor} title={`${historyFor?.name || ""} — tarix`} onClose={() => setHistoryFor(null)} wide>
        {!history ? (
          <div className="text-sm text-muted">Yuklanmoqda...</div>
        ) : (
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="mb-2 font-bold">Xaridlar</div>
              {history.sales.length === 0 ? <div className="text-muted">Xarid yo‘q</div> : null}
              {history.sales.slice(0, 20).map((s) => (
                <div key={s.number} className="flex justify-between border-t border-line py-2">
                  <div>
                    <div className="text-xs text-muted">{tashkentDateTime(s.created_at)}</div>
                    <div className="text-xs">{methodLabel(s.payment_method)}</div>
                  </div>
                  <div className={`num font-semibold ${s.payment_method === "qarz" ? "text-danger" : ""}`}>{som(s.total)}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 font-bold">To‘lovlar</div>
              {history.payments.length === 0 ? <div className="text-muted">To‘lov yo‘q</div> : null}
              {history.payments.slice(0, 20).map((p, i) => (
                <div key={i} className="flex justify-between border-t border-line py-2">
                  <span className="text-xs text-muted">{tashkentDateTime(p.created_at)}</span>
                  <span className="num font-semibold text-ok">{som(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
