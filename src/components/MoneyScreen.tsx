"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { EXPENSE_CATEGORIES, som, tashkentDateTime } from "@/lib/format";

type Payment = {
  id: number;
  kind: string;
  party_name: string | null;
  amount: number;
  method: string;
  category: string | null;
  note: string | null;
  created_at: string;
};

const kinds = [
  { id: "expense", label: "Xarajat" },
  { id: "income", label: "Boshqa kirim" },
  { id: "cash_in", label: "Kassaga qo‘yish" },
  { id: "cash_out", label: "Kassadan olish" },
];

export function MoneyScreen() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [kind, setKind] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Ijara");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await api<{ payments: Payment[] }>("/api/payments");
    setRows(data.payments);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function save() {
    setError("");
    try {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({ kind, amount: Number(amount), category, note, method: "naqd" }),
      });
      setAmount("");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Pul aylanmasi</h1>
      <Card className="grid gap-3 p-4 md:grid-cols-5">
        <Field label="Turi">
          <Select value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        {kind === "expense" ? (
          <Field label="Kategoriya">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        ) : (
          <div />
        )}
        <Field label="Summa">
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Izoh">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button className="w-full" onClick={save}>
            Yozish
          </Button>
        </div>
      </Card>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Sana</th>
              <th className="px-4 py-3 font-medium">Turi</th>
              <th className="px-4 py-3 font-medium">Izoh</th>
              <th className="px-4 py-3 font-medium">Summa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 text-muted">{tashkentDateTime(r.created_at)}</td>
                <td className="px-4 py-3">
                  {kinds.find((k) => k.id === r.kind)?.label || r.kind}
                  {r.category ? ` · ${r.category}` : ""}
                </td>
                <td className="px-4 py-3">{r.note || r.party_name || "—"}</td>
                <td className={`px-4 py-3 num font-semibold ${r.kind === "expense" || r.kind === "cash_out" || r.kind === "supplier" ? "text-danger" : "text-ok"}`}>
                  {som(r.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
