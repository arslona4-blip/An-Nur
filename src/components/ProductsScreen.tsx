"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, ListPlus, Loader2, Mic, Square, Tag, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { ImportProducts } from "@/components/ImportProducts";
import { api } from "@/lib/client";
import { som, UNITS } from "@/lib/format";
import { DRINK_SIZES, isDrinkCategory, packSize, withPackSize } from "@/lib/volume";
import { isLowStock } from "@/lib/stock";

const MAX_PHOTOS = 15;

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Chrome sends speech to Google; on phones the keyboard mic does the same job, so this button is only a shortcut.
function DictateButton({ onStart, onText, onStop, busy }: { onStart: () => void; onText: (text: string) => void; onStop: () => void; busy: boolean }) {
  const [rec, setRec] = useState<Recognition | null>(null);
  const [err, setErr] = useState("");
  const Ctor = speechRecognition();
  if (!Ctor) return null;

  function start() {
    const r = new Ctor!();
    r.lang = "uz-UZ";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => setErr(e.error === "not-allowed" ? "Mikrofonga ruxsat bering" : "Ovozni eshitib bo‘lmadi");
    r.onend = () => {
      setRec(null);
      onStop();
    };
    setErr("");
    onStart();
    r.start();
    setRec(r);
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant={rec ? "danger" : "ghost"} onClick={() => (rec ? rec.stop() : start())}>
        {rec ? <Square size={16} /> : <Mic size={16} />}
        {rec ? "To‘xtatish" : "Aytib berish"}
      </Button>
      {rec ? <span className="text-sm text-danger">Eshityapman… har mahsulotni «nomi, narxi, nechta» tartibida ayting</span> : null}
      {busy ? (
        <span className="flex items-center gap-1 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> AI tozalayapti…
        </span>
      ) : null}
      {err ? <span className="text-sm text-danger">{err}</span> : null}
    </div>
  );
}

function SizePicker({ name, show, onPick }: { name: string; show: boolean; onPick: (name: string) => void }) {
  if (!show) return null;
  const current = packSize(name);
  return (
    <Field label="Hajmi (ichimlik)">
      <div className="flex flex-wrap gap-2">
        {DRINK_SIZES.map((size) => {
          const active = current === packSize(`x ${size}`);
          return (
            <Button key={size} type="button" variant={active ? "primary" : "ghost"} onClick={() => onPick(withPackSize(name, size))}>
              {size}
            </Button>
          );
        })}
      </div>
      {!current ? <div className="mt-1 text-sm text-danger">Hajmni tanlang — har bir hajm alohida mahsulot</div> : null}
    </Field>
  );
}

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
  is_bundle?: number;
};
type Category = { id: number; name: string; product_count?: number };
type Part = { product_id: number; name: string; unit: string; qty: number };

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
  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<{ id: number; name: string } | null>(null);
  const [catDel, setCatDel] = useState<{ id: number; moveTo: string } | null>(null);
  const [catError, setCatError] = useState("");
  const [error, setError] = useState("");
  const [recognizing, setRecognizing] = useState(false);
  const [progress, setProgress] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [listText, setListText] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [tidying, setTidying] = useState(false);
  const dictRef = useRef({ base: "", raw: "", lines: [] as string[], tidiedLen: 0, pending: 0 });
  const tidyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [savingAi, setSavingAi] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [bundleOn, setBundleOn] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [partsDirty, setPartsDirty] = useState(false);
  const [partPick, setPartPick] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  async function openBundleEditor(productId: number | null, on: boolean) {
    setBundleOn(on);
    setPartsDirty(false);
    setPartPick("");
    setPartQty("1");
    setParts([]);
    if (on || productId) {
      api<{ products: Product[] }>("/api/products")
        .then((d) => setAllProducts(d.products))
        .catch(() => {});
    }
    if (productId && on) {
      const d = await api<{ parts: Array<{ component_id: number; name: string; unit: string; qty: number }> }>(
        `/api/products/bundle?id=${productId}`,
      );
      setParts(d.parts.map((p) => ({ product_id: p.component_id, name: p.name, unit: p.unit, qty: p.qty })));
    }
  }

  function addPart() {
    const p = allProducts.find((x) => String(x.id) === partPick);
    const qty = Number(partQty);
    if (!p || !(qty > 0)) return;
    setParts((prev) => {
      const i = prev.findIndex((x) => x.product_id === p.id);
      if (i >= 0) return prev.map((x, j) => (j === i ? { ...x, qty: x.qty + qty } : x));
      return [...prev, { product_id: p.id, name: p.name, unit: p.unit, qty }];
    });
    setPartsDirty(true);
    setPartPick("");
    setPartQty("1");
  }

  const partsCost = parts.reduce((s, x) => s + Math.round((allProducts.find((p) => p.id === x.product_id)?.buy_price || 0) * x.qty), 0);
  const partsPrice = parts.reduce((s, x) => s + Math.round((allProducts.find((p) => p.id === x.product_id)?.sell_price || 0) * x.qty), 0);

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
    openBundleEditor(null, false).catch(() => {});
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
    openBundleEditor(p.id, !!p.is_bundle).catch((e) => setError(e.message));
    setOpen(true);
  }

  async function recognizeFiles(files: File[]) {
    if (!files.length) return;
    setError("");
    setRecognizing(true);
    const drafts: Draft[] = [];
    const failed: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(files.length > 1 ? `${i + 1}/${files.length}` : "");
        try {
          drafts.push(...(await recognizeOne(files[i])));
        } catch (e) {
          failed.push(`${i + 1}-rasm: ${e instanceof Error ? e.message : "xato"}`);
        }
      }
      if (drafts.length) {
        await load();
        setAiDrafts(drafts);
        setAiOpen(true);
      }
      if (failed.length) setError(failed.length === files.length && files.length === 1 ? failed[0].replace(/^1-rasm: /, "") : failed.join("; "));
    } finally {
      setRecognizing(false);
      setProgress("");
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  async function recognizeOne(file: File): Promise<Draft[]> {
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
    return list.map((item) => ({
      ...emptyDraft(),
      name: item.name || "",
      unit: item.unit || "dona",
      buy_price: String(item.buy_price ?? ""),
      sell_price: String(item.sell_price ?? ""),
      category_id: item.category_id || "",
      image_url: item.image_url || "",
    }));
  }

  function showDictation() {
    const d = dictRef.current;
    const rest = d.raw.slice(d.tidiedLen).trim();
    setListText([d.base, ...d.lines, rest].filter(Boolean).join("\n"));
  }

  function dictStart() {
    clearTimeout(tidyTimer.current);
    dictRef.current = { base: listText.trimEnd(), raw: "", lines: [], tidiedLen: 0, pending: 0 };
  }

  function dictPiece(text: string) {
    const d = dictRef.current;
    const piece = text.trim();
    if (!piece) return;
    d.raw = d.raw ? `${d.raw} ${piece}` : piece;
    showDictation();
    clearTimeout(tidyTimer.current);
    tidyTimer.current = setTimeout(tidyNow, 900);
  }

  // Pauses split one product into fragments, so the whole session is re-tidied each time, not just the new piece.
  async function tidyNow() {
    clearTimeout(tidyTimer.current);
    const d = dictRef.current;
    const raw = d.raw;
    if (!raw.trim() || raw.length <= d.tidiedLen) return;
    d.pending++;
    setTidying(true);
    try {
      const r = await api<{ lines: string[] }>("/api/products/parse-list", {
        method: "POST",
        body: JSON.stringify({ mode: "tidy", text: raw }),
      });
      if (dictRef.current === d && raw.length > d.tidiedLen) {
        d.lines = r.lines;
        d.tidiedLen = raw.length;
        showDictation();
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      if (--d.pending === 0) setTidying(false);
    }
  }

  async function parseList() {
    setListError("");
    setListBusy(true);
    try {
      const d = await api<{
        products: Array<{ name: string; unit: string; buy_price: number; sell_price: number; stock: number; category_id: number | null }>;
      }>("/api/products/parse-list", { method: "POST", body: JSON.stringify({ text: listText }) });
      await load();
      setAiDrafts(
        d.products.map((p) => ({
          ...emptyDraft(),
          name: p.name,
          unit: p.unit,
          buy_price: p.buy_price ? String(p.buy_price) : "",
          sell_price: p.sell_price ? String(p.sell_price) : "",
          stock: p.stock ? String(p.stock) : "",
          category_id: p.category_id || "",
        })),
      );
      setListOpen(false);
      setListText("");
      setAiOpen(true);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setListBusy(false);
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
        buy_price: bundleOn ? partsCost : Number(form.buy_price || 0),
        sell_price: Number(form.sell_price || 0),
        stock: bundleOn ? 0 : Number(form.stock || 0),
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
      if (bundleOn && parts.length === 0) throw new Error("To‘plam tarkibiga mahsulot qo‘shing");
      if (needsSize(form.name, form.category_id, form.unit)) {
        throw new Error(`Ichimlik hajmini tanlang (${DRINK_SIZES.join(", ")})`);
      }
      const saved = editing
        ? await api<{ product: Product }>("/api/products", { method: "PUT", body: JSON.stringify(payload) })
        : await api<{ product: Product }>("/api/products", { method: "POST", body: JSON.stringify(payload) });
      const wasBundle = !!editing?.is_bundle;
      if ((bundleOn && (partsDirty || !wasBundle)) || (!bundleOn && wasBundle)) {
        await api("/api/products/bundle", {
          method: "PUT",
          body: JSON.stringify({
            id: saved.product.id,
            parts: bundleOn ? parts.map((x) => ({ product_id: x.product_id, qty: x.qty })) : [],
          }),
        });
      }
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  function needsSize(name: string, categoryId: string | number, unit: string) {
    const category = categories.find((c) => String(c.id) === String(categoryId))?.name;
    return isDrinkCategory(category) && unit === "dona" && !!name.trim() && !packSize(name);
  }

  async function saveAiDrafts() {
    setError("");
    const unsized = aiDrafts.find((d) => needsSize(d.name, d.category_id, d.unit));
    if (unsized) {
      setError(`«${unsized.name}» — ichimlik hajmini tanlang (${DRINK_SIZES.join(", ")})`);
      return;
    }
    setSavingAi(true);
    let done = 0;
    try {
      for (const d of aiDrafts) {
        if (!d.name.trim()) {
          done++;
          continue;
        }
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
        done++;
      }
      setAiOpen(false);
      setAiDrafts([]);
      await load();
    } catch (e) {
      const failed = aiDrafts[done];
      setAiDrafts((prev) => prev.slice(done));
      setError(`${done ? `${done} tasi saqlandi. ` : ""}«${failed?.name || ""}»: ${e instanceof Error ? e.message : "Xatolik"}`);
      if (done) load().catch(() => {});
    } finally {
      setSavingAi(false);
    }
  }

  async function addCategory() {
    if (!catName.trim()) return;
    setCatError("");
    try {
      await api("/api/categories", { method: "POST", body: JSON.stringify({ name: catName }) });
      setCatName("");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Xatolik";
      if (catOpen) setCatError(msg);
      else setError(msg);
    }
  }

  async function renameCategory() {
    if (!catEdit) return;
    setCatError("");
    try {
      await api("/api/categories", { method: "PUT", body: JSON.stringify(catEdit) });
      setCatEdit(null);
      await load();
    } catch (e) {
      setCatError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function removeCategory(c: Category) {
    setCatError("");
    const count = c.product_count || 0;
    if (!count && !confirm(`«${c.name}» toifasi o‘chirilsinmi?`)) return;
    const qs = new URLSearchParams({ id: String(c.id) });
    if (count) qs.set("moveTo", catDel?.id === c.id ? catDel.moveTo : "0");
    try {
      await api(`/api/categories?${qs}`, { method: "DELETE" });
      setCatDel(null);
      if (categoryFilter === String(c.id)) setCategoryFilter("");
      await load(q, categoryFilter === String(c.id) ? "" : categoryFilter);
    } catch (e) {
      setCatError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function removeProduct(p: Product) {
    if (!confirm(`«${p.name}» o‘chirilsinmi?`)) return;
    setError("");
    try {
      const { result } = await api<{ result: "deleted" | "archived" }>(`/api/products?id=${p.id}`, { method: "DELETE" });
      setOpen(false);
      await load();
      if (result === "archived") {
        alert(`«${p.name}» sotuv tarixida bor, shuning uchun sotuvdan olindi: kassada chiqmaydi, hisobotlarda nomi qoladi. Kerak bo‘lsa, qayta sotuvga qaytarish mumkin.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function restoreProduct(p: Product) {
    setError("");
    try {
      await api("/api/products", { method: "PUT", body: JSON.stringify({ id: p.id, active: true }) });
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
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
            {recognizing ? `AI o‘qiyapti${progress ? ` ${progress}` : "..."}` : "Rasm orqali"}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={recognizing}
              onChange={(e) => recognizeFiles(Array.from(e.target.files || []).slice(0, 1))}
            />
          </label>
          <label
            className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-black/5 ${recognizing ? "pointer-events-none opacity-50" : ""}`}
          >
            <ImageIcon size={16} />
            Galereyadan (bir nechta)
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={recognizing}
              onChange={(e) => recognizeFiles(Array.from(e.target.files || []).slice(0, MAX_PHOTOS))}
            />
          </label>
          <Button variant="ghost" onClick={() => setListOpen(true)} title="Mahsulotlarni ro‘yxat qilib yozing yoki ayting">
            <ListPlus size={16} />
            Ro‘yxat bilan
          </Button>
          <ImportProducts onDone={() => load().catch(() => {})} />
          <Button
            variant="ghost"
            disabled={!products.length}
            title="Ro‘yxatdagi mahsulotlarga narx yorlig‘i chop etish"
            onClick={() =>
              window.open(
                `/yorliq?ids=${products
                  .filter((p) => p.active)
                  .slice(0, 500)
                  .map((p) => p.id)
                  .join(",")}`,
                "_blank",
              )
            }
          >
            <Tag size={16} />
            Yorliqlar
          </Button>
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
        <Button
          variant="ghost"
          onClick={() => {
            setCatError("");
            setCatEdit(null);
            setCatDel(null);
            setCatOpen(true);
          }}
        >
          Toifalar
        </Button>
      </div>
      <Modal open={catOpen} title="Toifalar" onClose={() => setCatOpen(false)}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Yangi toifa nomi" />
            <Button className="shrink-0" onClick={addCategory} disabled={!catName.trim()}>
              Qo‘shish
            </Button>
          </div>
          {catError ? <div className="text-sm text-danger">{catError}</div> : null}
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
            {categories.length === 0 ? <div className="text-sm text-muted">Toifa yo‘q</div> : null}
            {categories.map((c) => (
              <div key={c.id} className="rounded-xl border border-line p-2.5">
                {catEdit?.id === c.id ? (
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      value={catEdit.name}
                      onChange={(e) => setCatEdit({ id: c.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameCategory();
                      }}
                    />
                    <Button className="shrink-0" onClick={renameCategory}>
                      Saqlash
                    </Button>
                    <Button variant="ghost" className="shrink-0" onClick={() => setCatEdit(null)}>
                      Bekor
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-muted">{c.product_count || 0} ta mahsulot</div>
                    </div>
                    <Button variant="ghost" className="shrink-0 px-3" onClick={() => setCatEdit({ id: c.id, name: c.name })}>
                      Nomini o‘zgartirish
                    </Button>
                    <Button
                      variant="ghost"
                      className="shrink-0 px-3 text-danger"
                      onClick={() => (c.product_count ? setCatDel({ id: c.id, moveTo: "0" }) : removeCategory(c))}
                    >
                      O‘chirish
                    </Button>
                  </div>
                )}
                {catDel?.id === c.id ? (
                  <div className="mt-2 space-y-2 rounded-lg bg-red-50 p-2.5 text-sm">
                    <div>
                      Bu toifada <b>{c.product_count}</b> ta mahsulot bor. Ular qayerga o‘tsin?
                    </div>
                    <Select value={catDel.moveTo} onChange={(e) => setCatDel({ id: c.id, moveTo: e.target.value })}>
                      <option value="0">Toifasiz qolsin</option>
                      {categories
                        .filter((x) => x.id !== c.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </Select>
                    <div className="flex gap-2">
                      <Button variant="danger" className="flex-1" onClick={() => removeCategory(c)}>
                        O‘chirish
                      </Button>
                      <Button variant="ghost" className="flex-1" onClick={() => setCatDel(null)}>
                        Bekor
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </Modal>
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
              <tr
                key={p.id}
                className={`cursor-pointer border-t border-line hover:bg-bg ${p.active ? "" : "opacity-50"}`}
                onClick={() => startEdit(p)}
              >
                <td className="px-4 py-2">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-xs text-muted">—</div>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">
                  {p.name}
                  {p.is_bundle ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">To‘plam</span>
                  ) : null}
                  {p.active ? null : (
                    <span className="ml-2 rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-muted">Sotuvdan olingan</span>
                  )}
                </td>
                <td className="px-4 py-3 num text-muted">{p.barcode || p.sku}</td>
                <td className="px-4 py-3">{p.category_name || "—"}</td>
                <td className={`px-4 py-3 num ${isLowStock(p) && p.active ? "text-danger font-semibold" : ""}`}>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap">
                    {isLowStock(p) && p.active ? <span className="low-dot" title="Kam qoldi" /> : null}
                    {p.stock} {p.unit}
                  </span>
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
          <SizePicker
            name={form.name}
            show={isDrinkCategory(categories.find((c) => String(c.id) === String(form.category_id))?.name)}
            onPick={(name) => setForm({ ...form, name })}
          />
          <Field label="Shtrix-kod">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </div>
              {!form.barcode.trim() ? (
                <Button
                  type="button"
                  variant="ghost"
                  title="Shtrix-kodi yo‘q mahsulotga do‘kon ichki kodini berish"
                  onClick={() =>
                    api<{ code: string }>("/api/products/barcode")
                      .then((d) => setForm((f) => ({ ...f, barcode: d.code })))
                      .catch((e) => setError(e.message))
                  }
                >
                  Yaratish
                </Button>
              ) : editing ? (
                <Button type="button" variant="ghost" onClick={() => window.open(`/yorliq?ids=${editing.id}`, "_blank")}>
                  Yorliq
                </Button>
              ) : null}
            </div>
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
          <label className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={bundleOn}
              onChange={(e) => {
                setBundleOn(e.target.checked);
                setPartsDirty(true);
                if (e.target.checked && !allProducts.length) {
                  api<{ products: Product[] }>("/api/products")
                    .then((d) => setAllProducts(d.products))
                    .catch(() => {});
                }
              }}
            />
            <span>
              <b>To‘plam (komplekt)</b> — bir nechta mahsulotdan iborat. Sotilganda ombordan har biri alohida ayiriladi.
            </span>
          </label>
          {bundleOn ? (
            <div className="space-y-2 rounded-xl bg-bg p-3">
              <div className="text-sm font-semibold">To‘plam tarkibi</div>
              {parts.length === 0 ? <div className="text-xs text-muted">Hali mahsulot qo‘shilmagan</div> : null}
              {parts.map((x) => (
                <div key={x.product_id} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{x.name}</span>
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      className="h-8"
                      value={x.qty}
                      onChange={(e) => {
                        const qty = Number(e.target.value);
                        setParts((prev) => prev.map((y) => (y.product_id === x.product_id ? { ...y, qty } : y)));
                        setPartsDirty(true);
                      }}
                    />
                  </div>
                  <span className="w-10 text-xs text-muted">{x.unit}</span>
                  <button
                    type="button"
                    className="px-1 text-muted"
                    aria-label="O‘chirish"
                    onClick={() => {
                      setParts((prev) => prev.filter((y) => y.product_id !== x.product_id));
                      setPartsDirty(true);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Select value={partPick} onChange={(e) => setPartPick(e.target.value)}>
                    <option value="">Mahsulot tanlang...</option>
                    {allProducts
                      .filter((p) => p.id !== editing?.id && !p.is_bundle)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.stock} {p.unit})
                        </option>
                      ))}
                  </Select>
                </div>
                <div className="w-20 shrink-0">
                  <Input type="number" step="0.001" min="0" value={partQty} onChange={(e) => setPartQty(e.target.value)} />
                </div>
                <Button type="button" variant="ghost" onClick={addPart} disabled={!partPick}>
                  Qo‘shish
                </Button>
              </div>
              {parts.length ? (
                <div className="text-xs text-muted">
                  Tarkib tannarxi: <b className="num">{som(partsCost)}</b> · alohida sotilsa: <b className="num">{som(partsPrice)}</b>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={bundleOn ? "Olish narxi (tarkibdan)" : "Olish narxi"}>
              <Input
                type="number"
                value={bundleOn ? String(partsCost) : form.buy_price}
                disabled={bundleOn}
                onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
              />
            </Field>
            <Field label="Sotish narxi">
              <Input type="number" value={form.sell_price} onChange={(e) => setForm({ ...form, sell_price: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={bundleOn ? "Nechta yig‘sa bo‘ladi" : "Omborda"}>
              <Input
                type="number"
                value={bundleOn ? (editing?.is_bundle && !partsDirty ? String(editing.stock) : "") : form.stock}
                placeholder={bundleOn ? "saqlangach hisoblanadi" : undefined}
                disabled={bundleOn}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
              />
            </Field>
            <Field label="Minimal qoldiq">
              <Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} />
            </Field>
          </div>
          <Field label="Yaroqlilik muddati (ixtiyoriy)">
            <Input type="date" value={form.expiry_date} suppressHydrationWarning onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </Field>
          <Button onClick={save}>Saqlash</Button>
          {editing ? (
            editing.active ? (
              <Button variant="ghost" className="text-danger" onClick={() => removeProduct(editing)}>
                Mahsulotni o‘chirish
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => restoreProduct(editing)}>
                Sotuvga qaytarish
              </Button>
            )
          ) : null}
        </div>
      </Modal>

      <Modal
        open={listOpen}
        title="Ro‘yxat bilan kiritish"
        onClose={() => {
          if (!listBusy) setListOpen(false);
        }}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Har bir mahsulotni yangi qatorga yoki vergul bilan yozing: nomi, narxi va nechta borligi. Telefonda klaviaturadagi 🎤 tugmasini bosib aytsangiz ham bo‘ladi.
          </p>
          <textarea
            className="w-full rounded-xl border border-line bg-white px-3 py-2 text-base"
            rows={8}
            value={listText}
            onChange={(e) => setListText(e.target.value)}
            placeholder={"Coca-Cola 1,5 litr 14 ming, 24 ta\nNon 4000, 30 ta\nShakar 1 kg olish 11 ming sotish 13 ming, 10 kilo\nPista 5 ming 15 ta"}
          />
          <DictateButton onStart={dictStart} onText={dictPiece} onStop={() => tidyNow()} busy={tidying} />
          {listError ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{listError}</div> : null}
          <Button className="w-full" disabled={listBusy || tidying || !listText.trim()} onClick={parseList}>
            {listBusy ? <Loader2 size={16} className="animate-spin" /> : null}
            {listBusy ? "AI jadval qilyapti..." : "AI bilan jadval qilish"}
          </Button>
          <p className="text-xs text-muted">Keyingi oynada hammasini tekshirib, bitta tugma bilan saqlaysiz.</p>
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
          <p className="text-sm text-muted">Nomi, narxi va toifasini tekshiring. Keraksizini 🗑 bilan olib tashlang, so‘ng saqlang.</p>
          {aiDrafts.map((d, i) => {
            const catLabel = categories.find((c) => String(c.id) === String(d.category_id))?.name;
            return (
            <div key={i} className="relative grid gap-3 rounded-xl border border-line p-3">
              <button
                type="button"
                title="Olib tashlash"
                className="absolute right-2 top-2 rounded-lg p-1.5 text-muted hover:bg-red-50 hover:text-danger"
                onClick={() => setAiDrafts((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 size={16} />
              </button>
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
              <SizePicker name={d.name} show={isDrinkCategory(catLabel)} onPick={(name) => updateAiDraft(i, { name })} />
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="O‘lchov">
                  <Select value={d.unit} onChange={(e) => updateAiDraft(i, { unit: e.target.value })}>
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Qoldiq (nechta bor)">
                  <Input type="number" value={d.stock} onChange={(e) => updateAiDraft(i, { stock: e.target.value })} />
                </Field>
              </div>
            </div>
            );
          })}
          {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
          <Button onClick={saveAiDrafts} disabled={savingAi || !aiDrafts.length}>
            {savingAi ? "Saqlanmoqda..." : "Hammasi saqlash"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
