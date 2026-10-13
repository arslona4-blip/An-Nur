import { listProducts, listSuppliers } from "./db";
import { UNITS } from "./format";
import { callVisionJson, openaiKey, parseUzsPrice } from "./phase5";
import { packSize, tidyPackSize } from "./volume";

export type InvoiceLine = {
  name: string;
  qty: number;
  unit: string;
  buy_price: number;
  sell_price: number;
  product_id: number | null;
  product_name: string | null;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/['ʼ`‘’ʻ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const ta = new Set(a.split(" ").filter((t) => t.length > 1));
  const tb = new Set(b.split(" ").filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

// Coca-Cola 1 L and 1.5 L share most words, so the pack size decides: a different size never matches,
// and a size on only one side is left for the user to pick.
function productSimilarity(line: { key: string; size: string | null }, cand: { key: string; size: string | null }) {
  const s = similarity(line.key, cand.key);
  if (line.size && cand.size) return line.size === cand.size ? s : 0;
  if (line.size || cand.size) return Math.min(s, 0.5);
  return s;
}

// Retail price for a product the shop has never sold: purchase price plus a 20% margin, rounded to 100 so'm.
const suggestSell = (buy: number) => Math.ceil((buy * 1.2) / 100) * 100;

export async function recognizeInvoice(file: File) {
  const key = openaiKey();
  if (!key) throw new Error("OpenAI API kaliti sozlanmagan — Sozlamalar → AI mahsulot");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Rasm juda katta (8 MB dan oshmasin)");
  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  const prompt = `Bu O'zbekistondagi do'konga kelgan yuk xati (nakladnoy, schyot-faktura yoki chek) rasmi.
Jadvaldagi HAR BIR mahsulot qatorini o'qing. FAQAT JSON qaytaring:
{
  "supplier": "yetkazib beruvchi nomi yoki bo'sh",
  "items": [
    { "name": "mahsulot nomi lotin yozuvida", "qty": 10, "unit": "dona|kg|litr|quti|m", "price": 4500, "sum": 45000 }
  ]
}
Qoidalar:
- name: rasmda kirill bo'lsa, lotinga o'giring (Кока-Кола → Coca-Cola, Нон → Non). Brend va hajmini/og'irligini ALBATTA qoldiring (Coca-Cola 1.5 L, Coca-Cola 0.5 L, Choy 100 g) — bir brendning har xil hajmi alohida mahsulot.
- unit: shisha, quti, paketdagi mahsulot — "dona" (hajmi nomda turadi). "litr"/"kg" faqat to'kib yoki tortib sotiladigan mahsulot uchun.
- qty: miqdor (son). price: BIR DONA narxi (so'm). sum: qator jami. Noma'lum bo'lsa 0.
- "10 000" = 10000, "2.500" = 2500.
- Jami, QQS, imzo, sarlavha qatorlarini mahsulot deb olmang.`;

  const parsed = await callVisionJson({ key, mime: file.type || "image/jpeg", b64, prompt });
  const raw = Array.isArray(parsed.items) ? (parsed.items as Array<Record<string, unknown>>) : [];
  if (!raw.length) throw new Error("Rasmda mahsulot topilmadi — yuk xatini to'g'ri va yorug' joyda rasmga oling");

  const products = listProducts({ includeInactive: true }).map((p) => ({ p, key: norm(p.name), size: packSize(p.name) }));
  const lines: InvoiceLine[] = [];
  for (const item of raw) {
    const name = tidyPackSize(String(item.name || "").trim());
    if (!name) continue;
    let qty = Number(String(item.qty ?? "").replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    let unit = String(item.unit || "dona").toLowerCase();
    if (!UNITS.includes(unit as (typeof UNITS)[number])) unit = "dona";
    let buy = parseUzsPrice(item.price);
    const sum = parseUzsPrice(item.sum);
    if (!buy && sum) buy = Math.round(sum / qty);

    const line = { key: norm(name), size: packSize(name) };
    let best: (typeof products)[number] | null = null;
    let score = 0;
    for (const cand of products) {
      const s = productSimilarity(line, cand);
      if (s > score || (s === score && best && !best.p.active && cand.p.active)) {
        best = cand;
        score = s;
      }
    }
    const match = score >= 0.6 ? best!.p : null;
    lines.push({
      name,
      qty,
      unit: match?.unit || unit,
      buy_price: buy,
      sell_price: match?.sell_price || suggestSell(buy),
      product_id: match?.id ?? null,
      product_name: match?.name ?? null,
    });
  }
  if (!lines.length) throw new Error("Rasmda mahsulot topilmadi");

  const supplierName = String(parsed.supplier || "").trim();
  const supplierKey = norm(supplierName);
  const supplier = supplierKey
    ? listSuppliers().find((s) => similarity(supplierKey, norm(s.name)) >= 0.6) || null
    : null;

  return { lines, supplier_name: supplierName, supplier_id: supplier?.id ?? null };
}
