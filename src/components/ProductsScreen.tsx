"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { som, UNITS } from "@/lib/format";

type Product = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  category_id: number | null;
  category_name: string | null;
  unit: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock: number;
  active: number;
  expiry_date?: string | null;
};
type Category = { id: number; name: string };

const empty = {
  name: "",
  barcode: "",
  category_id: "" as string | number,
  unit: "dona",
  buy_price: "",
  sell_price: "",
  stock: "",
  min_stock: "",
  expiry_date: "",
};

export function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(empty);
  const [catName, setCatName] = useState("");
  const [error, setError] = useState("");

  async function load(search = q) {
    const [p, c] = await Promise.all([
      api<{ products: Product[] }>(`/api/products?all=1&q=${encodeURIComponent(search)}`),
      api<{ categories: Category[] }>("/api/categories"),
    ]);
    setProducts(p.products);
    setCategories(c.categories);
  }

  useEffect(() => {
    load("").catch((e) => setError(e.message));
  }, []);

  function startCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }

  function startEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      barcode: p.barcode || "",
      category_id: p.category_id || "",
      unit: p.unit,
      buy_price: String(p.buy_price),
      sell_price: String(p.sell_price),
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      expiry_date: p.expiry_date || "",
    });
    setOpen(true);
  }

  async function save() {
    setError("");
    try {
      const payload = {
        id: editing?.id,
        name: form.name,
        barcode: form.barcode,
        category_id: form.category_id ? Number(form.category_id) : null,
        unit: form.unit,
        buy_price: Number(form.buy_price || 0),
        sell_price: Number(form.sell_price || 0),
        stock: Number(form.stock || 0),
        min_stock: Number(form.min_stock || 0),
        expiry_date: form.expiry_date || null,
      };
      if (editing) await api("/api/products", { method: "PUT", body: JSON.stringify(payload) });
      else await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function addCategory() {
    if (!catName.trim()) return;
    await api("/api/categories", { method: "POST", body: JSON.stringify({ name: catName }) });
    setCatName("");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Mahsulotlar</h1>
          <p className="text-sm text-muted">{products.length} ta mahsulot</p>
        </div>
        <Button onClick={startCreate}>Yangi mahsulot</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          placeholder="Qidirish..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            load(e.target.value).catch(() => {});
          }}
        />
        <Input className="max-w-xs" placeholder="Yangi kategoriya" value={catName} onChange={(e) => setCatName(e.target.value)} />
        <Button variant="ghost" onClick={addCategory}>
          Kategoriya qo‘shish
        </Button>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nomi</th>
              <th className="px-4 py-3 font-medium">Kod</th>
              <th className="px-4 py-3 font-medium">Kategoriya</th>
              <th className="px-4 py-3 font-medium">Omborda</th>
              <th className="px-4 py-3 font-medium">Olish</th>
              <th className="px-4 py-3 font-medium">Sotish</th>
              <th className="px-4 py-3 font-medium">Foyda</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="cursor-pointer border-t border-line hover:bg-bg" onClick={() => startEdit(p)}>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 num text-muted">{p.barcode || p.sku}</td>
                <td className="px-4 py-3">{p.category_name || "—"}</td>
                <td className={`px-4 py-3 num ${p.min_stock && p.stock <= p.min_stock ? "text-danger font-semibold" : ""}`}>
                  {p.stock} {p.unit}
                </td>
                <td className="px-4 py-3 num">{som(p.buy_price)}</td>
                <td className="px-4 py-3 num">{som(p.sell_price)}</td>
                <td className="px-4 py-3 num text-ok">{som(p.sell_price - p.buy_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={open} title={editing ? "Mahsulotni tahrirlash" : "Yangi mahsulot"} onClose={() => setOpen(false)}>
        <div className="grid gap-3">
          <Field label="Nomi">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Shtrix-kod">
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kategoriya">
              <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">Tanlanmagan</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="O‘lchov">
              <Select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Olish narxi">
              <Input type="number" value={form.buy_price} onChange={(e) => setForm({ ...form, buy_price: e.target.value })} />
            </Field>
            <Field label="Sotish narxi">
              <Input type="number" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Omborda">
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </Field>
            <Field label="Minimal qoldiq">
              <Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
            </Field>
          </div>
          <Field label="Yaroqlilik muddati (ixtiyoriy)">
            <Input type="date" value={form.expiry_date} suppressHydrationWarning onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </Field>
          <Button onClick={save}>Saqlash</Button>
        </div>
      </Modal>
    </div>
  );
}
