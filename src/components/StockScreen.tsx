"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { som, tashkentDateTime } from "@/lib/format";

type Product = { id: number; name: string; buy_price: number; sell_price: number; unit: string; stock: number };
type Supplier = { id: number; name: string };
type StockIn = {
  id: number;
  number: string;
  total: number;
  paid: number;
  supplier_name: string | null;
  user_name: string;
  created_at: string;
};
type Line = { product_id: number; name: string; qty: string; buy_price: string; expiry_date: string };

export function StockScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rows, setRows] = useState<StockIn[]>([]);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<number | 0>(0);
  const [paid, setPaid] = useState("0");
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [p, s, st] = await Promise.all([
      api<{ products: Product[] }>("/api/products?all=1"),
      api<{ suppliers: Supplier[] }>("/api/suppliers"),
      api<{ stockIns: StockIn[] }>("/api/stock"),
    ]);
    setProducts(p.products);
    setSuppliers(s.suppliers);
    setRows(st.stockIns);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function addLine() {
    const p = products.find((x) => String(x.id) === pick);
    if (!p) return;
    setLines((prev) => [...prev, { product_id: p.id, name: p.name, qty: "1", buy_price: String(p.buy_price), expiry_date: "" }]);
    setPick("");
  }

  const total = lines.reduce((s, l) => s + Math.round(Number(l.qty || 0) * Number(l.buy_price || 0)), 0);

  async function save() {
    setError("");
    try {
      await api("/api/stock", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId || null,
          paid: Number(paid || 0),
          items: lines.map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            buy_price: Number(l.buy_price),
            expiry_date: l.expiry_date || null,
          })),
        }),
      });
      setOpen(false);
      setLines([]);
      setPaid("0");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Ombor kirimi</h1>
          <p className="text-sm text-muted">Tovar kelganda qoldiq va tannarx yangilanadi</p>
        </div>
        <Button onClick={() => setOpen(true)}>Tovar qabul qilish</Button>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">Hali kirim yo‘q. “Tovar qabul qilish” tugmasidan boshlang.</Card>
      ) : (
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Hujjat</th>
              <th className="px-4 py-3 font-medium">Ta’minotchi</th>
              <th className="px-4 py-3 font-medium">Summa</th>
              <th className="px-4 py-3 font-medium">To‘langan</th>
              <th className="px-4 py-3 font-medium">Sana</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{r.number}</td>
                <td className="px-4 py-3">{r.supplier_name || "—"}</td>
                <td className="px-4 py-3 num">{som(r.total)}</td>
                <td className="px-4 py-3 num">{som(r.paid)}</td>
                <td className="px-4 py-3 text-muted">{tashkentDateTime(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}
      <Modal open={open} title="Tovar qabul qilish" onClose={() => setOpen(false)} wide>
        <div className="space-y-3">
          <Field label="Ta’minotchi">
            <Select value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))}>
              <option value={0}>Tanlanmagan</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Mahsulot qo‘shish</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Button variant="ghost" onClick={addLine}>
              Qo‘shish
            </Button>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line p-2">
              <div className="text-sm font-medium">{l.name}</div>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Miqdor" value={l.qty} onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, qty: e.target.value } : x)))} />
                <Input placeholder="Narx" value={l.buy_price} onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, buy_price: e.target.value } : x)))} />
                <Input type="date" placeholder="Muddati" value={l.expiry_date} suppressHydrationWarning onChange={(e) => setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, expiry_date: e.target.value } : x)))} />
              </div>
            </div>
          ))}
          <div className="flex justify-between font-bold">
            <span>Jami</span>
            <span className="num">{som(total)}</span>
          </div>
          <Field label="Hozir to‘langan">
            <Input value={paid} onChange={(e) => setPaid(e.target.value)} />
          </Field>
          {error ? <div className="text-sm text-danger">{error}</div> : null}
          <Button className="w-full" disabled={!lines.length} onClick={save}>
            Qabul qilish
          </Button>
        </div>
      </Modal>
    </div>
  );
}
