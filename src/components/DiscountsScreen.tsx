"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";

type Rule = {
  id: number;
  name: string;
  kind: "percent" | "fixed";
  value: number;
  target: "all" | "category" | "product";
  target_id: number | null;
  min_qty: number | null;
  min_amount: number | null;
  active: number;
};

type Category = { id: number; name: string };
type Product = { id: number; name: string };

const empty = {
  name: "",
  kind: "percent" as "percent" | "fixed",
  value: "",
  target: "all" as "all" | "category" | "product",
  target_id: "",
  min_qty: "",
  min_amount: "",
};

export function DiscountsScreen() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");

  async function load() {
    const [d, c, p] = await Promise.all([
      api<{ rules: Rule[] }>("/api/discounts"),
      api<{ categories: Category[] }>("/api/categories"),
      api<{ products: Product[] }>("/api/products?all=1"),
    ]);
    setRules(d.rules);
    setCategories(c.categories);
    setProducts(p.products);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function save() {
    setError("");
    try {
      await api("/api/discounts", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          kind: form.kind,
          value: Number(form.value),
          target: form.target,
          target_id: form.target_id ? Number(form.target_id) : null,
          min_qty: form.min_qty ? Number(form.min_qty) : null,
          min_amount: form.min_amount ? Number(form.min_amount) : null,
        }),
      });
      setOpen(false);
      setForm(empty);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function toggle(r: Rule) {
    await api("/api/discounts", { method: "PUT", body: JSON.stringify({ id: r.id, active: !r.active }) });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("O'chirishni tasdiqlaysizmi?")) return;
    await api(`/api/discounts?id=${id}`, { method: "DELETE" });
    await load();
  }

  function targetLabel(r: Rule) {
    if (r.target === "all") return "Butun savatcha";
    if (r.target === "category") return categories.find((c) => c.id === r.target_id)?.name || "Kategoriya";
    return products.find((p) => p.id === r.target_id)?.name || "Mahsulot";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Chegirma qoidalari</h1>
          <p className="text-sm text-muted">Kassada avtomatik qo'llanadigan chegirmalar</p>
        </div>
        <Button onClick={() => setOpen(true)}>Yangi qoida</Button>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nomi</th>
              <th className="px-4 py-3 font-medium">Chegirma</th>
              <th className="px-4 py-3 font-medium">Qamrov</th>
              <th className="px-4 py-3 font-medium">Holat</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">{r.kind === "percent" ? `${r.value}%` : `${r.value} so'm`}</td>
                <td className="px-4 py-3">{targetLabel(r)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(r)} className={r.active ? "text-ok" : "text-muted"}>
                    {r.active ? "Faol" : "O'chiq"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-danger" onClick={() => remove(r.id)}>
                    O'chirish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} title="Chegirma qoidasi" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Nomi">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Masalan: Non 10%" />
          </Field>
          <Field label="Turi">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "fixed" })}>
              <option value="percent">Foiz (%)</option>
              <option value="fixed">Qat'iy summa</option>
            </Select>
          </Field>
          <Field label="Qiymat">
            <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </Field>
          <Field label="Qaysi mahsulotga">
            <Select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value as typeof form.target, target_id: "" })}>
              <option value="all">Butun savatcha</option>
              <option value="category">Kategoriya</option>
              <option value="product">Mahsulot</option>
            </Select>
          </Field>
          {form.target === "category" ? (
            <Field label="Kategoriya">
              <Select value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })}>
                <option value="">Tanlang</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {form.target === "product" ? (
            <Field label="Mahsulot">
              <Select value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })}>
                <option value="">Tanlang</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Min. miqdor (ixtiyoriy)">
            <Input type="number" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value })} />
          </Field>
          <Field label="Min. summa (ixtiyoriy)">
            <Input type="number" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} />
          </Field>
          <Button className="w-full" onClick={save}>
            Saqlash
          </Button>
        </div>
      </Modal>
    </div>
  );
}
