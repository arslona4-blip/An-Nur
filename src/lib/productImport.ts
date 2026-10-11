import { getDb } from "./db";
import { UNITS } from "./format";

export type ImportRow = {
  name?: string;
  barcode?: string;
  category?: string;
  unit?: string;
  buy_price?: number | string;
  sell_price?: number | string;
  stock?: number | string;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; error: string }[];
};

const MAX_ROWS = 5000;

function num(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "")
    .replace(/[\s\u00a0]/g, "")
    .replace(/so['‘’`]?m|сум|uzs/gi, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function normalizeUnit(v: unknown) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!s) return "dona";
  if ((UNITS as readonly string[]).includes(s)) return s;
  if (/^(кг|kilo|килограмм)/.test(s)) return "kg";
  if (/^(л|литр|litr|liter|lt)/.test(s)) return "litr";
  if (/^(уп|упак|кор|коробка|quti|blok|блок|pachka|пачка)/.test(s)) return "quti";
  if (/^(м|метр|metr)$/.test(s)) return "m";
  return "dona";
}

export function importProducts(rows: ImportRow[], updateStock: boolean): ImportResult {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Faylda mahsulot topilmadi");
  if (rows.length > MAX_ROWS) throw new Error(`Bir martada ko‘pi bilan ${MAX_ROWS} ta mahsulot yuklanadi`);

  const db = getDb();
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const fail = (row: number, error: string) => {
    result.skipped++;
    if (result.errors.length < 30) result.errors.push({ row, error });
  };

  const categories = new Map<string, number>();
  for (const c of db.prepare("SELECT id, name FROM categories").all() as { id: number; name: string }[]) {
    categories.set(c.name.trim().toLowerCase(), c.id);
  }
  const addCategory = db.prepare("INSERT INTO categories (name, color, sort) VALUES (?, '#0f766e', ?)");
  const byBarcode = db.prepare("SELECT id FROM products WHERE barcode = ? LIMIT 1");
  const byName = db.prepare("SELECT id FROM products WHERE lower(trim(name)) = lower(?) LIMIT 1");
  const insert = db.prepare(
    `INSERT INTO products (sku, barcode, name, category_id, unit, buy_price, sell_price, stock, min_stock, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)`,
  );
  const update = db.prepare(
    `UPDATE products SET barcode = COALESCE(?, barcode), name = ?, category_id = COALESCE(?, category_id), unit = ?,
       buy_price = ?, sell_price = ?, stock = CASE WHEN ? THEN ? ELSE stock END, active = 1 WHERE id = ?`,
  );
  let skuNo = (db.prepare("SELECT COALESCE(MAX(id), 0) AS m FROM products").get() as { m: number }).m;
  const skuTaken = db.prepare("SELECT 1 FROM products WHERE sku = ?");
  const now = new Date().toISOString();

  db.exec("BEGIN");
  try {
    rows.forEach((r, i) => {
      const line = i + 1;
      const name = String(r.name ?? "").trim().slice(0, 200);
      if (!name) return fail(line, "Nomi yo‘q");
      const barcode = String(r.barcode ?? "").trim().replace(/\.0+$/, "").slice(0, 64) || null;
      const buy = num(r.buy_price);
      const sell = num(r.sell_price);
      const stock = num(r.stock);
      if (Number.isNaN(buy) || Number.isNaN(sell)) return fail(line, `«${name}»: narx raqam emas`);
      if (Number.isNaN(stock)) return fail(line, `«${name}»: qoldiq raqam emas`);
      if (buy < 0 || sell < 0 || stock < 0) return fail(line, `«${name}»: manfiy qiymat`);

      let categoryId: number | null = null;
      const catName = String(r.category ?? "").trim().slice(0, 80);
      if (catName) {
        const key = catName.toLowerCase();
        if (!categories.has(key)) {
          const info = addCategory.run(catName, categories.size + 1);
          categories.set(key, Number(info.lastInsertRowid));
        }
        categoryId = categories.get(key)!;
      }

      const existing = ((barcode && byBarcode.get(barcode)) || byName.get(name)) as { id: number } | undefined;
      const unit = normalizeUnit(r.unit);
      if (existing) {
        update.run(barcode, name, categoryId, unit, Math.round(buy), Math.round(sell), updateStock ? 1 : 0, stock, existing.id);
        result.updated++;
      } else {
        let sku: string;
        do sku = `HIS-${String(++skuNo).padStart(4, "0")}`;
        while (skuTaken.get(sku));
        insert.run(sku, barcode, name, categoryId, unit, Math.round(buy), Math.round(sell), stock, now);
        result.created++;
      }
    });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return result;
}
