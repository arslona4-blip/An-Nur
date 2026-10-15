import { normalizeEan } from "@/lib/ean13";

// Only the barcode number leaves the shop; both services are free and need no key.
const cache = new Map<string, string>();

function tidyQuantity(q: string) {
  return q
    .replace(/\s+/g, " ")
    .replace(/(\d)\s*ml\b/i, "$1 ml")
    .replace(/(\d)\s*(l|л)\b/i, "$1 L")
    .replace(/(\d)\s*(g|г|gr)\b/i, "$1 g")
    .replace(/(\d)\s*(kg|кг)\b/i, "$1 kg")
    .trim();
}

function compose(brand: string, name: string, quantity: string) {
  const b = brand.split(",")[0].trim();
  let out = name.trim();
  const shortBrand = b.split(/\s+/)[0];
  if (shortBrand && !out.toLowerCase().includes(shortBrand.toLowerCase()) && b.length <= 20) out = `${b} ${out}`;
  const q = tidyQuantity(quantity);
  if (q && !out.toLowerCase().includes(q.toLowerCase())) out = `${out} ${q}`;
  return out.replace(/\s+/g, " ").trim().slice(0, 120);
}

async function openFoodFacts(code: string) {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_uz,product_name_ru,product_name_en,brands,quantity`,
    { headers: { "User-Agent": "AnNurKassa/1.0" }, signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    status?: number;
    product?: Record<string, string | undefined>;
  };
  const p = data.product;
  if (data.status !== 1 || !p) return null;
  const name = p.product_name_uz || p.product_name || p.product_name_en || p.product_name_ru || "";
  if (!name.trim()) return null;
  return compose(p.brands || "", name, p.quantity || "");
}

async function upcItemDb(code: string) {
  const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { items?: Array<{ title?: string }> };
  const title = data.items?.[0]?.title?.trim();
  return title ? title.slice(0, 120) : null;
}

export async function lookupBarcodeName(raw: string): Promise<string | null> {
  const code = normalizeEan(raw.trim());
  if (!/^\d{8,14}$/.test(code)) return null;
  if (cache.has(code)) return cache.get(code)!;
  let name: string | null = null;
  for (const source of [openFoodFacts, upcItemDb]) {
    try {
      name = await source(code);
    } catch {
      name = null;
    }
    if (name) break;
  }
  if (name) cache.set(code, name);
  return name;
}
