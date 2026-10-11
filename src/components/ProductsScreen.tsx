"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { ImportProducts } from "@/components/ImportProducts";
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
  image_url?: string | null;
};
type Category = { id: number; name: string };

type Draft = {
  name: string;
  barcode: string;
  category_id: string | number;
  unit: string;
  buy_price: string;
  sell_price: string;
  stock: string;
  min_stock: string;
  expiry_date: string;
  image_url: string;
};

const emptyDraft = (): Draft => ({
  name: "",
  barcode: "",
  category_id: "",
  unit: "dona",
  buy_price: "",
  sell_price: "",
  stock: "",
  min_stock: "",
  expiry_date: "",
  image_url: "",
});

export function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Draft>(emptyDraft());
  const [aiDrafts, setAiDrafts] = useState<Draft[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [error, setError] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function load(search = q, cat = categoryFilter) {
    const qs = new URLSearchParams({ all: "1", q: search });
    if (cat) qs.set("categoryId", cat);
    const [p, c] = await Promise.all([
      api<{ products: Product[] }>(`/api/products?${qs}`),
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
    setForm(emptyDraft());
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
      image_url: p.image_url || "",
    });
    setOpen(true);
  }

  async function recognizeFromFile(file: File) {
    setError("");
    setRecognizing(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/products/recognize", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        products?: Array<{
          name?: string;
          unit?: string;
          buy_price?: number;
          sell_price?: number;
          category_id?: number | null;
          image_url?: string;
        }>;
        product?: {
          name?: string;
          unit?: string;
          buy_price?: number;
          sell_price?: number;
          category_id?: number | null;
          image_url?: string;
        };
      };
      if (!res.ok) throw new Error(data.error || "AI aniqlay olmadi");
      const list = data.products?.length ? data.products : data.product ? [data.product] : [];
      if (!list.length) throw new Error("Mahsulot topilmadi");
      const drafts = list.map((item) => ({
        ...emptyDraft(),
        name: item.name || "",
        unit: item.unit || "dona",
        buy_price: String(item.buy_price ?? ""),
        sell_price: String(item.sell_price ?? ""),
        category_id: item.category_id || "",
        image_url: item.image_url || "",
      }));
      await load();
      setAiDrafts(drafts);
      setAiOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setRecognizing(false);
      if (cameraRef.current) cameraRef.current.value = "";
    }
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
        image_url: form.image_url || null,
      };
      if (
        payload.sell_price > 0 &&
        payload.buy_price > payload.sell_price &&
        !window.confirm("Sotish narxi olish narxidan past — har sotuvda zarar bo‘ladi. Baribir saqlansinmi?")
      ) {
        return;
      }
      if (editing) await api("/api/products", { method: "PUT", body: JSON.stringify(payload) });
      else await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function saveAiDrafts() {
    setError("");
    setSavingAi(true);
    try {
      for (const d of aiDrafts) {
        if (!d.name.trim()) continue;
        await api("/api/products", {
          method: "POST",
          body: JSON.stringify({
            name: d.name,
            barcode: d.barcode,
            category_id: d.category_id ? Number(d.category_id) : null,
            unit: d.unit,
            buy_price: Number(d.buy_price || 0),
            sell_price: Number(d.sell_price || 0),
            stock: Number(d.stock || 0),
            min_stock: Number(d.min_stock || 0),
            expiry_date: d.expiry_date || null,
            image_url: d.image_url || null,
          }),
        });
      }
      setAiOpen(false);
      setAiDrafts([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setSavingAi(false);
    }
  }

  async function addCategory() {
    if (!catName.trim()) return;
    await api("/api/categories", { method: "POST", body: JSON.stringify({ name: catName }) });
    setCatName("");
    await load();
  }

  function updateAiDraft(i: number, patch: Partial<Draft>) {
    setAiDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Mahsulotlar</h1>
          <p className="text-sm text-muted">{products.length} ta mahsulot</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark ${recognizing ? "pointer-events-none opacity-50" : ""}`}
          >
            {recognizing ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            {recognizing ? "Reklama tayyorlanmoqda..." : "Rasm orqali"}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={recognizing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) recognizeFromFile(f);
              }}
            />
          </label>
          <ImportProducts onDone={() => load().catch(() => {})} />
          <Button onClick={startCreate}>Yangi mahsulot</Button>
        </div>
      </div>
      <p className="text-sm text-muted">
        Telegram/WhatsApp skrinshotini tashlang — AI nom va narxni o‘qiydi, reklamabop rasm yasaydi.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          placeholder="Qidirish..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            load(e.target.value, categoryFilter).catch(() => {});
          }}
        />
        <Select
          className="max-w-xs"
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            load(q, e.target.value).catch(() => {});
          }}
        >
          <option value="">Barcha toifalar</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
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
              <th className="px-4 py-3 font-medium">Rasm</th>
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
                <td className="px-4 py-2">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-xs text-muted">—</div>
                  )}
                </td>
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
          {form.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.image_url} alt="" className="mx-auto h-40 w-40 rounded-xl object-cover" />
          ) : null}
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

      <Modal
        open={aiOpen}
        title={`AI topdi: ${aiDrafts.length} ta mahsulot`}
        onClose={() => {
          if (!savingAi) setAiOpen(false);
        }}
      >
        <div className="grid max-h-[70vh] gap-4 overflow-y-auto">
          <p className="text-sm text-muted">Reklamabop rasm va narxni tekshiring, so‘ng saqlang.</p>
          {aiDrafts.map((d, i) => {
            const catLabel = categories.find((c) => String(c.id) === String(d.category_id))?.name;
            return (
            <div key={i} className="grid gap-3 rounded-xl border border-line p-3">
              {d.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.image_url} alt="" className="mx-auto h-48 w-48 rounded-xl object-cover shadow" />
              ) : null}
              {catLabel ? (
                <div className="text-center text-sm font-semibold text-brand">Toifa: {catLabel}</div>
              ) : (
                <div className="text-center text-sm text-danger">Toifa tanlanmagan — pastdan tanlang</div>
              )}
              <Field label="Nomi">
                <Input value={d.name} onChange={(e) => updateAiDraft(i, { name: e.target.value })} />
              </Field>
              <Field label="Kategoriya (toifa)">
                <Select value={d.category_id} onChange={(e) => updateAiDraft(i, { category_id: e.target.value })}>
                  <option value="">Tanlanmagan</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sotish narxi">
                  <Input type="number" value={d.sell_price} onChange={(e) => updateAiDraft(i, { sell_price: e.target.value })} />
                </Field>
                <Field label="Olish narxi">
                  <Input type="number" value={d.buy_price} onChange={(e) => updateAiDraft(i, { buy_price: e.target.value })} />
                </Field>
              </div>
              <Field label="O‘lchov">
                <Select value={d.unit} onChange={(e) => updateAiDraft(i, { unit: e.target.value })}>
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
            </div>
            );
          })}
          <Button onClick={saveAiDrafts} disabled={savingAi}>
            {savingAi ? "Saqlanmoqda..." : "Hammasi saqlash"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
