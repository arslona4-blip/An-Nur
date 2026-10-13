"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { Barcode } from "@/components/Barcode";
import { Button, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { isCode128 } from "@/lib/code128";
import { som } from "@/lib/format";

type Product = { id: number; name: string; barcode: string | null; unit: string; sell_price: number };

const SIZES = {
  "58x40": { label: "Termo yorliq 58×40 mm", w: 58, h: 40, page: "58mm 40mm", sheet: false },
  "40x30": { label: "Termo yorliq 40×30 mm", w: 40, h: 30, page: "40mm 30mm", sheet: false },
  a4: { label: "A4 qog‘oz (3×8 = 24 ta)", w: 70, h: 37, page: "A4", sheet: true },
} as const;
type SizeKey = keyof typeof SIZES;

const SIZE_KEY = "annur-label-size";

export function LabelSheet({ ids }: { ids: number[] }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [copies, setCopies] = useState<Record<number, number>>({});
  const [size, setSize] = useState<SizeKey>("58x40");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await api<{ products: Product[] }>(`/api/products?ids=${ids.join(",")}`);
    setProducts(d.products);
    setCopies((prev) => Object.fromEntries(d.products.map((p) => [p.id, prev[p.id] ?? 1])));
  }

  useEffect(() => {
    const saved = localStorage.getItem(SIZE_KEY) as SizeKey | null;
    if (saved && saved in SIZES) setSize(saved);
    load().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function giveCodes() {
    setBusy(true);
    setError("");
    try {
      for (const p of products.filter((x) => !x.barcode?.trim())) {
        await api("/api/products/barcode", { method: "POST", body: JSON.stringify({ id: p.id }) });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  const spec = SIZES[size];
  const labels = products.flatMap((p) => Array.from({ length: Math.max(0, copies[p.id] || 0) }, () => p));
  const noCode = products.filter((p) => !p.barcode?.trim()).length;
  const badCode = products.filter((p) => p.barcode?.trim() && !isCode128(p.barcode)).length;
  const priceUnit = (p: Product) => (p.unit === "dona" ? "" : ` / ${p.unit}`);

  return (
    <div className="min-h-dvh bg-bg">
      <style>{`@media print { @page { size: ${spec.page}; margin: 0; } }`}</style>
      <div className="no-print mx-auto max-w-4xl space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold">Narx yorliqlari</h1>
            <p className="text-sm text-muted">{labels.length} ta yorliq chop etiladi</p>
          </div>
          <div className="flex gap-2">
            <Link href="/mahsulotlar" className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold">
              Orqaga
            </Link>
            <Button onClick={() => window.print()} disabled={!labels.length}>
              <Printer size={16} />
              Chop etish
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3">
          <span className="text-sm font-semibold">Yorliq o‘lchami</span>
          <div className="w-64">
            <Select
              value={size}
              onChange={(e) => {
                setSize(e.target.value as SizeKey);
                localStorage.setItem(SIZE_KEY, e.target.value);
              }}
            >
              {Object.entries(SIZES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {noCode ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{noCode} ta mahsulotda shtrix-kod yo‘q — yorliqda faqat nomi va narxi chiqadi.</span>
            <Button variant="gold" onClick={giveCodes} disabled={busy}>
              {busy ? "Berilmoqda..." : "Ularga shtrix-kod berish"}
            </Button>
          </div>
        ) : null}
        {badCode ? (
          <div className="rounded-xl bg-bg px-4 py-2 text-xs text-muted">
            {badCode} ta mahsulotning kodida lotin harf va raqamdan boshqa belgi bor — chiziqlari chiqmaydi, faqat kodi yoziladi.
          </div>
        ) : null}
        {error ? <div className="text-sm text-danger">{error}</div> : null}
        <div className="overflow-hidden rounded-2xl bg-white">
          {products.length === 0 ? <div className="p-6 text-center text-sm text-muted">Mahsulot tanlanmagan</div> : null}
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.name}</div>
                <div className="text-xs text-muted num">
                  {som(p.sell_price)}
                  {priceUnit(p)} · {p.barcode || "kodsiz"}
                </div>
              </div>
              <span className="text-xs text-muted">Nusxa</span>
              <div className="w-20">
                <Input
                  type="number"
                  min="0"
                  max="200"
                  value={copies[p.id] ?? 1}
                  onChange={(e) => setCopies({ ...copies, [p.id]: Math.min(200, Math.max(0, Math.round(Number(e.target.value)))) })}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="text-sm font-semibold text-muted">Ko‘rinishi:</div>
      </div>
      <div className={`label-sheet ${spec.sheet ? "label-a4" : ""} mx-auto flex max-w-4xl flex-wrap gap-2 px-4 pb-10 print:gap-0 print:p-0`}>
        {labels.map((p, i) => (
          <div
            key={i}
            className="label-item flex flex-col justify-between overflow-hidden border border-dashed border-line bg-white px-[2mm] py-[1.5mm] text-black print:border-0"
            style={{ width: `${spec.w}mm`, height: `${spec.h}mm` }}
          >
            <div className={`line-clamp-2 font-bold leading-tight ${spec.h <= 30 ? "text-[8pt]" : "text-[10pt]"}`}>{p.name}</div>
            <div className={`font-extrabold leading-none num ${spec.h <= 30 ? "text-[13pt]" : "text-[17pt]"}`}>
              {som(p.sell_price)}
              <span className="text-[8pt] font-semibold">{priceUnit(p)}</span>
            </div>
            {p.barcode && isCode128(p.barcode) ? (
              <Barcode code={p.barcode} className={`w-full ${spec.h <= 30 ? "h-[10mm]" : "h-[13mm]"}`} />
            ) : p.barcode ? (
              <div className="text-[8pt] num">{p.barcode}</div>
            ) : (
              <div />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
