"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { readSheet } from "@/lib/sheet";

const FIELDS = [
  { key: "name", label: "Nomi", required: true },
  { key: "barcode", label: "Shtrix-kod" },
  { key: "category", label: "Kategoriya" },
  { key: "unit", label: "O‘lchov birligi" },
  { key: "buy_price", label: "Olish narxi" },
  { key: "sell_price", label: "Sotish narxi" },
  { key: "stock", label: "Qoldiq" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Mapping = Record<FieldKey, number>;
type Result = { created: number; updated: number; skipped: number; errors: { row: number; error: string }[] };

// Checked in this order so that "закупочная цена" is not taken for the sale price.
const PATTERNS: [FieldKey, RegExp][] = [
  ["barcode", /shtrix|shtrih|barkod|barcode|штрих|ean/],
  ["buy_price", /olish|kirim|tannarx|xarid|закуп|себестоим|приход|входн|cost|purchase/],
  ["sell_price", /sotish|narx|розн|продаж|цена|price/],
  ["stock", /qoldiq|miqdor|soni|остат|колич|колво|qty|quantity|stock/],
  ["unit", /birlik|olchov|o.lchov|едизм|единиц|unit/],
  ["category", /kategor|toifa|guruh|катег|групп|category|group/],
  ["name", /nom|mahsulot|tovar|наимен|назван|товар|номенкл|name|product/],
];

function norm(s: string) {
  return s.toLowerCase().replace(/[\s.\-_'‘’`ʻ]/g, "");
}

function detect(headers: string[]): Mapping {
  const map = Object.fromEntries(FIELDS.map((f) => [f.key, -1])) as Mapping;
  headers.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const hit = PATTERNS.find(([key, re]) => map[key] === -1 && re.test(n));
    if (hit) map[hit[0]] = i;
  });
  return map;
}

function findHeader(rows: string[][]) {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 15).forEach((r, i) => {
    const m = detect(r);
    const score = Object.values(m).filter((v) => v >= 0).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

export function ImportProducts({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Mapping | null>(null);
  const [updateStock, setUpdateStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  function reset() {
    setFileName("");
    setRows([]);
    setHeaders([]);
    setMap(null);
    setError("");
    setResult(null);
    setUpdateStock(false);
  }

  async function pick(file: File) {
    reset();
    setBusy(true);
    try {
      const all = (await readSheet(file)).filter((r) => r.some((c) => String(c).trim()));
      if (all.length < 2) throw new Error("Faylda ma’lumot topilmadi");
      const h = findHeader(all);
      setHeaders(all[h].map((c) => String(c).trim()));
      setRows(all.slice(h + 1));
      setMap(detect(all[h]));
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Faylni o‘qib bo‘lmadi");
    } finally {
      setBusy(false);
    }
  }

  const items = map
    ? rows
        .map((r) =>
          Object.fromEntries(FIELDS.map((f) => [f.key, map[f.key] >= 0 ? String(r[map[f.key]] ?? "").trim() : ""])),
        )
        .filter((it) => it.name)
    : [];

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ result: Result }>("/api/products/import", {
        method: "POST",
        body: JSON.stringify({ rows: items, updateStock }),
      });
      setResult(d.result);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ghost" onClick={() => (reset(), setOpen(true))}>
        <FileSpreadsheet size={16} /> Excel’dan yuklash
      </Button>
      <Modal open={open} title="Mahsulotlarni Excel’dan yuklash" onClose={() => setOpen(false)} wide>
        <div className="space-y-4 text-sm">
          {!result ? (
            <>
              <p className="text-muted">
                Boshqa dasturdan (Zifra, 1C, Billz va h.k.) mahsulotlarni Excel (.xlsx) yoki CSV qilib chiqaring va shu yerda
                tanlang. Ustunlar avtomatik aniqlanadi, kerak bo‘lsa o‘zingiz to‘g‘rilaysiz.
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 font-semibold hover:bg-bg">
                {busy && !map ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                {fileName || "Faylni tanlash"}
                <input
                  type="file"
                  accept=".xlsx,.csv,.txt,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pick(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </>
          ) : null}

          {map && !result ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center justify-between gap-2">
                    <span className="w-32 shrink-0 font-semibold">
                      {f.label}
                      {"required" in f ? " *" : ""}
                    </span>
                    <Select
                      aria-label={f.label}
                      value={map[f.key]}
                      onChange={(e) => setMap({ ...map, [f.key]: Number(e.target.value) })}
                    >
                      <option value={-1}>— yo‘q —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `${i + 1}-ustun`}
                        </option>
                      ))}
                    </Select>
                  </label>
                ))}
              </div>

              {map.name < 0 ? (
                <div className="rounded-xl bg-red-50 px-3 py-2 text-danger">«Nomi» ustunini tanlang.</div>
              ) : (
                <>
                  <div className="font-semibold">
                    {items.length} ta mahsulot topildi. Birinchi {Math.min(items.length, 8)} tasi:
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-xs">
                      <thead className="bg-bg text-left">
                        <tr>
                          {FIELDS.map((f) => (
                            <th key={f.key} className="px-2 py-1.5">
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.slice(0, 8).map((it, i) => (
                          <tr key={i} className="border-t border-line">
                            {FIELDS.map((f) => (
                              <td key={f.key} className="px-2 py-1.5">
                                {it[f.key]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={updateStock} onChange={(e) => setUpdateStock(e.target.checked)} />
                    <span>
                      Bor mahsulotlarning qoldig‘ini ham fayldagidek qilish
                      <span className="block text-muted">
                        Bir xil shtrix-kod yoki nomli mahsulot qayta qo‘shilmaydi — narxi yangilanadi. Yangi mahsulotlar qoldig‘i
                        doim fayldan olinadi.
                      </span>
                    </span>
                  </label>
                  <Button onClick={submit} disabled={busy || items.length === 0}>
                    {busy ? "Yuklanmoqda..." : `${items.length} ta mahsulotni yuklash`}
                  </Button>
                </>
              )}
            </>
          ) : null}

          {result ? (
            <div className="space-y-2">
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
                Tayyor: {result.created} ta yangi qo‘shildi, {result.updated} ta yangilandi
                {result.skipped ? `, ${result.skipped} ta o‘tkazib yuborildi` : ""}.
              </div>
              {result.errors.length ? (
                <ul className="list-disc pl-5 text-muted">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      {e.row}-mahsulot: {e.error}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Yopish
              </Button>
            </div>
          ) : null}

          {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-danger">{error}</div> : null}
        </div>
      </Modal>
    </>
  );
}
