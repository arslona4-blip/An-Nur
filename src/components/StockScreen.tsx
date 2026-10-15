"use client";

import { Camera, ScanLine, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { LinkBarcode } from "@/components/LinkBarcode";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { sameBarcode, STORE_BARCODE_PREFIX } from "@/lib/ean13";
import { som, tashkentDateTime, UNITS } from "@/lib/format";

type Product = { id: number; name: string; barcode: string | null; sku: string; buy_price: number; sell_price: number; unit: string; stock: number };
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
// product_id 0 means the line is a product the shop does not have yet; it is created on save.
type Line = {
  product_id: number;
  name: string;
  unit: string;
  qty: string;
  buy_price: string;
  sell_price: string;
  expiry_date: string;
  barcode?: string;
};
type InvoiceLine = {
  name: string;
  qty: number;
  unit: string;
  buy_price: number;
  sell_price: number;
  product_id: number | null;
};

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
  const [reading, setReading] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

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

  function lineFor(p: Product, qty = "1"): Line {
    return {
      product_id: p.id,
      name: p.name,
      unit: p.unit,
      qty,
      buy_price: String(p.buy_price),
      sell_price: String(p.sell_price),
      expiry_date: "",
    };
  }

  function addLine() {
    const p = products.find((x) => String(x.id) === pick);
    if (!p) return;
    setLines((prev) => [...prev, lineFor(p)]);
    setPick("");
  }

  // Scanning the same code again adds one more instead of a duplicate line; the touched line moves to the top.
  function addByCode(raw: string) {
    const c = raw.trim();
    setCode("");
    if (!c) return;
    const p = products.find((x) => sameBarcode(x.barcode, c) || x.sku === c);
    setLines((prev) => {
      const at = prev.findIndex((l) => (p ? l.product_id === p.id : !l.product_id && l.barcode === c));
      if (at >= 0) {
        const bumped = { ...prev[at], qty: String((Number(prev[at].qty) || 0) + 1) };
        return [bumped, ...prev.filter((_, i) => i !== at)];
      }
      const fresh: Line = p
        ? lineFor(p)
        : { product_id: 0, name: "", unit: "dona", qty: "1", buy_price: "", sell_price: "", expiry_date: "", barcode: c };
      return [fresh, ...prev];
    });
    setScanNote(p ? `${p.name} qo‘shildi` : `Yangi shtrix kod ${c} — nomi internetdan qidirilmoqda…`);
    codeRef.current?.focus();
    if (!p) lookupName(c);
  }

  async function lookupName(c: string) {
    const r = await api<{ name: string | null }>(`/api/products/lookup?code=${encodeURIComponent(c)}`).catch(() => ({ name: null }));
    if (r.name) {
      setLines((prev) => prev.map((l) => (!l.product_id && l.barcode === c && !l.name.trim() ? { ...l, name: r.name! } : l)));
    }
    setScanNote(
      r.name
        ? `Nomi topildi: ${r.name} — tekshirib, narxini yozing`
        : `Shtrix kod ${c} internet bazasida yo‘q — nomini yozing yoki bazadan toping`,
    );
  }

  const addByCodeRef = useRef(addByCode);
  useEffect(() => {
    addByCodeRef.current = addByCode;
  });
  const onScanCode = useCallback((c: string) => addByCodeRef.current(c), []);
  const closeScan = useCallback(() => setScanOpen(false), []);

  function linkLine(i: number, p: Product) {
    setProducts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    setLines((prev) =>
      prev.map((x, idx) =>
        idx !== i
          ? x
          : {
              ...x,
              product_id: p.id,
              name: p.name,
              unit: p.unit,
              buy_price: x.buy_price || String(p.buy_price),
              sell_price: x.sell_price || String(p.sell_price),
            },
      ),
    );
    setScanNote(`${p.name} — shtrix kod biriktirildi`);
  }

  function patchLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function relink(i: number, id: string) {
    const p = products.find((x) => String(x.id) === id);
    setLines((prev) =>
      prev.map((x, idx) =>
        idx !== i ? x : p ? { ...x, product_id: p.id, unit: p.unit, sell_price: String(p.sell_price) } : { ...x, product_id: 0 },
      ),
    );
  }

  async function readInvoice(file: File) {
    setError("");
    setAiNote("");
    setReading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/stock/recognize", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        lines?: InvoiceLine[];
        supplier_id?: number | null;
        supplier_name?: string;
      };
      if (!res.ok || !data.lines) throw new Error(data.error || "Rasmni o'qib bo'lmadi");
      setLines(
        data.lines.map((l) => ({
          product_id: l.product_id || 0,
          name: l.name,
          unit: l.unit,
          qty: String(l.qty),
          buy_price: String(l.buy_price),
          sell_price: String(l.sell_price),
          expiry_date: "",
        })),
      );
      if (data.supplier_id) setSupplierId(data.supplier_id);
      const fresh = data.lines.filter((l) => !l.product_id).length;
      setAiNote(
        `Rasmdan ${data.lines.length} ta mahsulot o'qildi${fresh ? `, ${fresh} tasi yangi` : ""}${
          data.supplier_name && !data.supplier_id ? ` · ta'minotchi: ${data.supplier_name}` : ""
        }. Miqdor va narxlarni tekshirib, "Qabul qilish"ni bosing.`,
      );
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const total = lines.reduce((s, l) => s + Math.round(Number(l.qty || 0) * Number(l.buy_price || 0)), 0);

  async function save() {
    setError("");
    setSaving(true);
    try {
      if (lines.some((l) => !l.product_id && !l.name.trim())) throw new Error("Yangi mahsulot nomini yozing");
      const ready = [...lines];
      for (let i = 0; i < ready.length; i++) {
        const l = ready[i];
        if (l.product_id) {
          const known = products.find((p) => p.id === l.product_id);
          if (l.barcode && known && (!known.barcode || known.barcode.startsWith(STORE_BARCODE_PREFIX))) {
            await api("/api/products", { method: "PUT", body: JSON.stringify({ id: known.id, barcode: l.barcode }) });
          }
          continue;
        }
        const { product } = await api<{ product: Product }>("/api/products", {
          method: "POST",
          body: JSON.stringify({
            name: l.name,
            unit: l.unit,
            barcode: l.barcode || undefined,
            buy_price: Number(l.buy_price || 0),
            sell_price: Number(l.sell_price || 0),
            stock: 0,
          }),
        });
        ready[i] = { ...l, product_id: product.id };
        setLines([...ready]);
      }
      await api("/api/stock", {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId || null,
          paid: Number(paid || 0),
          items: ready.map((l) => ({
            product_id: l.product_id,
            qty: Number(l.qty),
            buy_price: Number(l.buy_price),
            sell_price: Number(l.sell_price) || undefined,
            expiry_date: l.expiry_date || null,
          })),
        }),
      });
      setOpen(false);
      setLines([]);
      setPaid("0");
      setAiNote("");
      setScanNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Ombor kirimi</h1>
          <p className="text-sm text-muted">Tovar kelganda qoldiq va tannarx yangilanadi</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="gold" disabled={reading} onClick={() => fileRef.current?.click()}>
            <Camera size={18} />
            {reading ? "Rasm o'qilmoqda..." : "Yuk xati rasmidan"}
          </Button>
          <Button onClick={() => setOpen(true)}>Tovar qabul qilish</Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readInvoice(f);
          }}
        />
      </div>
      {error && !open ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          Hali kirim yo‘q. Yuk xatini rasmga oling yoki “Tovar qabul qilish” tugmasidan boshlang.
        </Card>
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
          {aiNote ? <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{aiNote}</div> : null}
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
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addByCode(code);
            }}
          >
            <Input
              ref={codeRef}
              autoFocus
              value={code}
              inputMode="numeric"
              placeholder="Shtrix kodni skanerlang yoki yozing"
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="button" variant="ghost" aria-label="Kamera bilan skanerlash" onClick={() => setScanOpen(true)}>
              <ScanLine size={18} />
            </Button>
            <Button type="submit" variant="ghost" disabled={!code.trim()}>
              Qo‘shish
            </Button>
          </form>
          {scanNote ? <div className="text-sm text-muted">{scanNote}</div> : null}
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
            <div
              key={i}
              className={`space-y-2 rounded-xl border p-2 ${l.product_id ? "border-line" : "border-amber-300 bg-amber-50/50"}`}
            >
              <div className="flex items-center gap-2">
                {l.product_id ? (
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">
                    {products.find((p) => p.id === l.product_id)?.name || l.name}
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                      YANGI
                    </span>
                    <Input
                      value={l.name}
                      placeholder="Mahsulot nomi"
                      onChange={(e) => patchLine(i, { name: e.target.value })}
                      className="py-1.5"
                    />
                  </div>
                )}
                <button
                  aria-label="O‘chirish"
                  className="shrink-0 p-1 text-muted"
                  onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {l.barcode ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="num">Shtrix kod: {l.barcode}</span>
                  {!l.product_id
                    ? UNITS.map((u) => (
                        <button
                          key={u}
                          type="button"
                          className={`rounded-full border px-2 py-0.5 text-xs! ${l.unit === u ? "border-brand bg-brand font-bold text-white" : "border-line"}`}
                          onClick={() => patchLine(i, { unit: u })}
                        >
                          {u}
                        </button>
                      ))
                    : null}
                </div>
              ) : null}
              {l.barcode && !l.product_id ? (
                <LinkBarcode<Product> barcode={l.barcode} autoFocus={false} onLinked={(p) => linkLine(i, p)} />
              ) : null}
              {aiNote ? (
                <Select value={l.product_id || ""} onChange={(e) => relink(i, e.target.value)} className="py-1.5 text-sm">
                  <option value="">➕ Yangi mahsulot sifatida qo‘shish</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>label]:min-w-0">
                <label className="text-xs text-muted">
                  Miqdor ({l.unit})
                  <Input value={l.qty} inputMode="decimal" onChange={(e) => patchLine(i, { qty: e.target.value })} />
                </label>
                <label className="text-xs text-muted">
                  Kelish narxi
                  <Input value={l.buy_price} inputMode="numeric" onChange={(e) => patchLine(i, { buy_price: e.target.value })} />
                </label>
                <label className="text-xs text-muted">
                  Sotish narxi
                  <Input value={l.sell_price} inputMode="numeric" onChange={(e) => patchLine(i, { sell_price: e.target.value })} />
                </label>
                <label className="min-w-0 text-xs text-muted">
                  Muddati
                  <Input
                    type="date"
                    className="h-[46px] w-full min-w-0 appearance-none"
                    value={l.expiry_date}
                    suppressHydrationWarning
                    onChange={(e) => patchLine(i, { expiry_date: e.target.value })}
                  />
                </label>
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
          <Button className="w-full" disabled={!lines.length || saving} onClick={save}>
            {saving ? "Saqlanmoqda..." : "Qabul qilish"}
          </Button>
        </div>
      </Modal>
      {scanOpen ? <BarcodeScanner onScan={onScanCode} onClose={closeScan} /> : null}
    </div>
  );
}
