"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { methodLabel, PAYMENT_METHODS, qty, som, tashkentDateTime } from "@/lib/format";

type SaleItem = {
  id: number;
  name: string;
  unit: string;
  qty: number;
  sell_price: number;
  total: number;
  returned?: number;
};

type Sale = {
  id: number;
  number: string;
  total: number;
  payment_method: string;
  customer_name?: string;
  created_at: string;
  items: SaleItem[];
};

type ReturnRow = {
  id: number;
  number: string;
  sale_number: string;
  total: number;
  refund_method: string;
  user_name: string;
  created_at: string;
};

export function ReturnsScreen() {
  const [number, setNumber] = useState("");
  const [sale, setSale] = useState<Sale | null>(null);
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({});
  const [method, setMethod] = useState("naqd");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadReturns() {
    const d = await api<{ returns: ReturnRow[] }>("/api/shifts");
    setReturns(d.returns);
  }

  useEffect(() => {
    loadReturns().catch((e) => setError(e.message));
  }, []);

  async function findSale() {
    setError("");
    setMsg("");
    setSale(null);
    if (!number.trim()) return;
    try {
      const d = await api<{ sale: Sale }>(`/api/shifts?action=sale&number=${encodeURIComponent(number.trim())}`);
      setSale(d.sale);
      const q: Record<number, string> = {};
      for (const it of d.sale.items) q[it.id] = "0";
      setQtyMap(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function submitReturn() {
    if (!sale) return;
    const items = sale.items
      .map((it) => ({ sale_item_id: it.id, qty: Number(qtyMap[it.id] || 0) }))
      .filter((x) => x.qty > 0);
    if (!items.length) {
      setError("Qaytariladigan miqdor kiriting");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/shifts", {
        method: "POST",
        body: JSON.stringify({ action: "return", saleId: sale.id, refundMethod: method, note, items }),
      });
      setMsg("Qaytarish saqlandi");
      setSale(null);
      setNumber("");
      await loadReturns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Savdo qaytarish</h1>
        <p className="text-sm text-muted">Chek raqami bo‘yicha mahsulot qaytarish</p>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      {msg ? <div className="text-sm text-ok">{msg}</div> : null}

      <Card className="space-y-3 p-4">
        <Field label="Chek raqami">
          <div className="flex gap-2">
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="S-20250828-0001" />
            <Button onClick={findSale}>Qidirish</Button>
          </div>
        </Field>
      </Card>

      {sale ? (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <div>
              <div className="font-bold">{sale.number}</div>
              <div className="text-muted">{tashkentDateTime(sale.created_at)} · {methodLabel(sale.payment_method)}</div>
            </div>
            <div className="font-bold num">{som(sale.total)}</div>
          </div>
          <div className="space-y-2">
            {sale.items.map((it) => {
              const max = it.qty - (it.returned || 0);
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{it.name}</div>
                    <div className="text-xs text-muted">
                      Sotilgan: {qty(it.qty, it.unit)} · Qaytarilgan: {qty(it.returned || 0, it.unit)} · Qolgan: {qty(max, it.unit)}
                    </div>
                  </div>
                  <Input
                    type="number"
                    step="0.001"
                    min={0}
                    max={max}
                    className="w-24"
                    value={qtyMap[it.id] || "0"}
                    onChange={(e) => setQtyMap({ ...qtyMap, [it.id]: e.target.value })}
                  />
                </div>
              );
            })}
          </div>
          <Field label="Qaytarish usuli">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Izoh">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button disabled={busy} onClick={submitReturn}>
            {busy ? "Saqlanmoqda..." : "Qaytarishni tasdiqlash"}
          </Button>
        </Card>
      ) : null}

      <Card className="overflow-x-auto">
        <div className="px-4 py-3 font-bold">Oxirgi qaytarishlar</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Raqam</th>
              <th className="px-4 py-2 font-medium">Chek</th>
              <th className="px-4 py-2 font-medium">Summa</th>
              <th className="px-4 py-2 font-medium">Usul</th>
              <th className="px-4 py-2 font-medium">Kassir</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-2">{r.number}</td>
                <td className="px-4 py-2">{r.sale_number}</td>
                <td className="px-4 py-2 num">{som(r.total)}</td>
                <td className="px-4 py-2">{methodLabel(r.refund_method)}</td>
                <td className="px-4 py-2">{r.user_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
