"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { qty, som, tashkentDateTime } from "@/lib/format";

type Product = { id: number; name: string; unit: string; stock: number; buy_price: number };
type WasteRow = {
  id: number;
  number: string;
  name: string;
  qty: number;
  unit: string;
  loss_amount: number;
  reason: string;
  user_name: string;
  created_at: string;
};

export function WasteScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [waste, setWaste] = useState<WasteRow[]>([]);
  const [productId, setProductId] = useState(0);
  const [qtyVal, setQtyVal] = useState("1");
  const [reason, setReason] = useState("Boshqa");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [p, w] = await Promise.all([
      api<{ products: Product[] }>("/api/products"),
      api<{ reasons: string[]; waste: WasteRow[] }>("/api/waste"),
    ]);
    setProducts(p.products);
    setReasons(w.reasons);
    setWaste(w.waste);
    if (w.reasons.length) setReason(w.reasons[0]);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function submit() {
    if (!productId) {
      setError("Mahsulot tanlang");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      await api("/api/waste", {
        method: "POST",
        body: JSON.stringify({ productId, qty: Number(qtyVal), reason, note }),
      });
      setMsg("Yo'qotish qayd etildi");
      setQtyVal("1");
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  const selected = products.find((p) => p.id === productId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Yo'qotish / buzilgan</h1>
        <p className="text-sm text-muted">Muddati o'tgan, singan yoki boshqa yo'qotishlar</p>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      {msg ? <div className="text-sm text-ok">{msg}</div> : null}

      <Card className="space-y-3 p-4">
        <Field label="Mahsulot">
          <Select value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
            <option value={0}>Tanlang...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stock} {p.unit})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Miqdor">
          <Input type="number" step="0.001" value={qtyVal} onChange={(e) => setQtyVal(e.target.value)} />
        </Field>
        <Field label="Sabab">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Izoh">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {selected ? (
          <div className="text-sm text-muted">
            Taxminiy yo'qotish: {som(Math.round(Number(qtyVal || 0) * selected.buy_price))}
          </div>
        ) : null}
        <Button disabled={busy} onClick={submit}>
          {busy ? "Saqlanmoqda..." : "Qayd etish"}
        </Button>
      </Card>

      <Card className="overflow-x-auto">
        <div className="px-4 py-3 font-bold">Oxirgi yozuvlar</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Raqam</th>
              <th className="px-4 py-2 font-medium">Mahsulot</th>
              <th className="px-4 py-2 font-medium">Miqdor</th>
              <th className="px-4 py-2 font-medium">Yo'qotish</th>
              <th className="px-4 py-2 font-medium">Sabab</th>
            </tr>
          </thead>
          <tbody>
            {waste.map((w) => (
              <tr key={w.id} className="border-t border-line">
                <td className="px-4 py-2">{w.number}</td>
                <td className="px-4 py-2">{w.name}</td>
                <td className="px-4 py-2">{qty(w.qty, w.unit)}</td>
                <td className="px-4 py-2 num text-danger">{som(w.loss_amount)}</td>
                <td className="px-4 py-2">{w.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
