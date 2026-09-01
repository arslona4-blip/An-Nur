"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { methodLabel, som, tashkentDateTime } from "@/lib/format";

type Party = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  debt?: number;
  payable?: number;
  note: string | null;
};

export function PartiesScreen({ kind }: { kind: "customers" | "suppliers" }) {
  const isCust = kind === "customers";
  const [rows, setRows] = useState<Party[]>([]);
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState<Party | null>(null);
  const [historyOpen, setHistoryOpen] = useState<Party | null>(null);
  const [history, setHistory] = useState<{
    sales: Array<{ number: string; total: number; payment_method: string; created_at: string }>;
    payments: Array<{ amount: number; created_at: string }>;
    stats: { spent: number; orders: number };
  } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", note: "" });
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ customers?: Party[]; suppliers?: Party[] }>(`/api/${kind}`);
    setRows((isCust ? data.customers : data.suppliers) || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [kind]);

  async function save() {
    setError("");
    try {
      await api(`/api/${kind}`, { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ name: "", phone: "", address: "", note: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function openHistory(p: Party) {
    setHistoryOpen(p);
    setHistory(null);
    try {
      const d = await api<{
        sales: Array<{ number: string; total: number; payment_method: string; created_at: string }>;
        payments: Array<{ amount: number; created_at: string }>;
        stats: { spent: number; orders: number };
      }>(`/api/customers?id=${p.id}&action=history`);
      setHistory(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function sendDebtSms(p: Party) {
    if (!p.phone) {
      setError("Telefon yo'q");
      return;
    }
    try {
      await api("/api/sms", {
        method: "POST",
        body: JSON.stringify({ action: "debt", phone: p.phone, name: p.name, debt: p.debt || 0 }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "SMS xatolik");
    }
  }

  async function pay() {
    if (!payOpen) return;
    setError("");
    try {
      await api(`/api/${kind}`, {
        method: "POST",
        body: JSON.stringify({ action: "pay", id: payOpen.id, amount: Number(amount) }),
      });
      setPayOpen(null);
      setAmount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  const title = isCust ? "Mijozlar" : "Ta’minotchilar";
  const moneyKey = isCust ? "debt" : "payable";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{title}</h1>
          <p className="text-sm text-muted">Qarz va to‘lovlar shu yerda</p>
        </div>
        <Button onClick={() => setOpen(true)}>{isCust ? "Yangi mijoz" : "Yangi ta’minotchi"}</Button>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nomi</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium">{isCust ? "Qarzi" : "Bizning qarz"}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.phone || "—"}</td>
                <td className={`px-4 py-3 num ${(r[moneyKey] || 0) > 0 ? "text-danger font-semibold" : ""}`}>
                  {som(Number(r[moneyKey] || 0))}
                </td>
                <td className="px-4 py-3 text-right">
                  {isCust && r.phone && (r.debt || 0) > 0 ? (
                    <Button variant="ghost" className="mr-1" onClick={() => sendDebtSms(r)}>
                      SMS
                    </Button>
                  ) : null}
                  {isCust ? (
                    <Button variant="ghost" className="mr-1" onClick={() => openHistory(r)}>
                      Tarix
                    </Button>
                  ) : null}
                  <Button variant="ghost" onClick={() => setPayOpen(r)}>
                    To‘lov
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Nomi">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Telefon">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Manzil">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Button className="w-full" onClick={save}>
            Saqlash
          </Button>
        </div>
      </Modal>
      <Modal open={!!payOpen} title={`${payOpen?.name} — to‘lov`} onClose={() => setPayOpen(null)}>
        <div className="space-y-3">
          <div className="text-sm text-muted">
            Qoldiq: <b className="text-ink num">{som(Number(payOpen?.[moneyKey] || 0))}</b>
          </div>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Summa" />
          {error ? <div className="text-sm text-danger">{error}</div> : null}
          <Button className="w-full" onClick={pay}>
            Qabul qilish
          </Button>
        </div>
      </Modal>
      <Modal open={!!historyOpen} title={`${historyOpen?.name} — tarix`} onClose={() => setHistoryOpen(null)} wide>
        {!history ? (
          <div className="text-sm text-muted">Yuklanmoqda...</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-bg p-3">
                <div className="text-muted">Jami xarid</div>
                <div className="font-bold num">{som(history.stats.spent)}</div>
              </div>
              <div className="rounded-xl bg-bg p-3">
                <div className="text-muted">Buyurtmalar</div>
                <div className="font-bold">{history.stats.orders} ta</div>
              </div>
            </div>
            <div>
              <div className="mb-2 font-bold">Savdolar</div>
              {history.sales.length === 0 ? <div className="text-muted">Savdo yo'q</div> : null}
              {history.sales.slice(0, 20).map((s) => (
                <div key={s.number} className="flex justify-between border-t border-line py-2">
                  <div>
                    <div>{s.number}</div>
                    <div className="text-xs text-muted">{tashkentDateTime(s.created_at)} · {methodLabel(s.payment_method)}</div>
                  </div>
                  <div className="num font-semibold">{som(s.total)}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-2 font-bold">To'lovlar</div>
              {history.payments.length === 0 ? <div className="text-muted">To'lov yo'q</div> : null}
              {history.payments.slice(0, 10).map((p, i) => (
                <div key={i} className="flex justify-between border-t border-line py-2">
                  <span className="text-muted">{tashkentDateTime(p.created_at)}</span>
                  <span className="num text-ok">{som(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
