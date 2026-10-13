import { DatabaseSync } from "node:sqlite";
import { getDb } from "./db";

type SqlRow = Record<string, unknown>;

export function migratePhase8(db: DatabaseSync) {
  const cols = (table: string) =>
    new Set((db.prepare(`SELECT name FROM pragma_table_info('${table}')`).all() as { name: string }[]).map((c) => c.name));
  if (!cols("customers").has("bonus")) db.exec("ALTER TABLE customers ADD COLUMN bonus INTEGER NOT NULL DEFAULT 0");
  const sales = cols("sales");
  if (!sales.has("bonus_used")) db.exec("ALTER TABLE sales ADD COLUMN bonus_used INTEGER NOT NULL DEFAULT 0");
  if (!sales.has("bonus_earned")) db.exec("ALTER TABLE sales ADD COLUMN bonus_earned INTEGER NOT NULL DEFAULT 0");
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      old_buy INTEGER NOT NULL,
      new_buy INTEGER NOT NULL,
      old_sell INTEGER NOT NULL,
      new_sell INTEGER NOT NULL,
      source TEXT NOT NULL,
      user_id INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_price_history_created ON price_history(created_at);
  `);
}

// ---------- Bonus (keshbek) ----------

export function bonusConfig(s: Record<string, string>) {
  const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  return {
    enabled: s.bonus_enabled === "1",
    pct: clamp(Number(s.bonus_pct || 0), 0, 50),
    maxPct: clamp(Number(s.bonus_max_pct || 100), 0, 100),
  };
}

export function resolveBonusUse(
  db: DatabaseSync,
  customerId: number | null | undefined,
  requested: unknown,
  payable: number,
  s: Record<string, string>,
) {
  const want = Math.round(Number(requested) || 0);
  if (want <= 0) return 0;
  const cfg = bonusConfig(s);
  if (!cfg.enabled) throw new Error("Bonus tizimi o'chirilgan");
  if (!customerId) throw new Error("Bonus bilan to'lash uchun mijoz tanlang");
  const c = db.prepare("SELECT bonus FROM customers WHERE id = ?").get(customerId) as { bonus: number } | undefined;
  if (!c) throw new Error("Mijoz topilmadi");
  const cap = Math.floor((Math.max(0, payable) * cfg.maxPct) / 100);
  return Math.max(0, Math.min(want, Number(c.bonus) || 0, cap));
}

export function earnedBonus(total: number, method: string, customerId: number | null | undefined, s: Record<string, string>) {
  const cfg = bonusConfig(s);
  if (!cfg.enabled || !customerId || method === "qarz" || total <= 0) return 0;
  return Math.floor((total * cfg.pct) / 100);
}

export function recordSaleBonus(db: DatabaseSync, saleId: number, customerId: number, used: number, earned: number) {
  if (!used && !earned) return;
  db.prepare("UPDATE sales SET bonus_used = ?, bonus_earned = ? WHERE id = ?").run(used, earned, saleId);
  db.prepare("UPDATE customers SET bonus = MAX(0, bonus - ? + ?) WHERE id = ?").run(used, earned, customerId);
}

// A return gives back the spent bonus and takes away what the returned part had earned.
export function returnSaleBonus(db: DatabaseSync, sale: SqlRow, fraction: number) {
  const customerId = Number(sale.customer_id || 0);
  if (!customerId || !(fraction > 0)) return;
  const f = Math.min(1, fraction);
  const back = Math.round(Number(sale.bonus_used || 0) * f);
  const claw = Math.round(Number(sale.bonus_earned || 0) * f);
  if (!back && !claw) return;
  db.prepare("UPDATE customers SET bonus = MAX(0, bonus + ? - ?) WHERE id = ?").run(back, claw, customerId);
}

// ---------- Price history ----------

export function logPriceChange(
  db: DatabaseSync,
  productId: number,
  before: { buy: number; sell: number },
  after: { buy: number; sell: number },
  source: string,
  userId?: number | null,
) {
  if (before.buy === after.buy && before.sell === after.sell) return;
  db.prepare(
    `INSERT INTO price_history (product_id, old_buy, new_buy, old_sell, new_sell, source, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(productId, before.buy, after.buy, before.sell, after.sell, source, userId ?? null, new Date().toISOString());
}

export function listPriceHistory(opts: { productId?: number; limit?: number }) {
  const limit = Math.min(500, Math.max(1, Math.round(opts.limit || 100)));
  const where = opts.productId ? "WHERE h.product_id = ?" : "";
  const args = opts.productId ? [opts.productId, limit] : [limit];
  return getDb()
    .prepare(
      `SELECT h.id, h.product_id, p.name, p.unit, h.old_buy, h.new_buy, h.old_sell, h.new_sell, h.source, h.created_at,
              u.name AS user_name
       FROM price_history h JOIN products p ON p.id = h.product_id LEFT JOIN users u ON u.id = h.user_id
       ${where} ORDER BY h.created_at DESC, h.id DESC LIMIT ?`,
    )
    .all(...args) as SqlRow[];
}

// ---------- Bulk price change ----------

export type BulkPriceInput = {
  categoryId?: number | null;
  supplierId?: number | null;
  mode: "pct" | "markup" | "sum";
  value: number;
  round?: number;
  exclude?: number[];
};

const LAST_SUPPLIER_SQL = `(SELECT si.supplier_id FROM stock_in_items it JOIN stock_ins si ON si.id = it.stock_in_id
   WHERE it.product_id = p.id AND si.supplier_id IS NOT NULL ORDER BY si.created_at DESC, si.id DESC LIMIT 1)`;

export function bulkPricePreview(input: BulkPriceInput) {
  const value = Number(input.value);
  if (!Number.isFinite(value)) throw new Error("Qiymat noto'g'ri");
  if (!["pct", "markup", "sum"].includes(input.mode)) throw new Error("Usul noto'g'ri");
  if (input.mode === "pct" && (value <= -90 || value > 500)) throw new Error("Foiz -90 dan 500 gacha bo'lsin");
  if (input.mode === "markup" && (value < 0 || value > 500)) throw new Error("Ustama 0 dan 500% gacha bo'lsin");
  const step = [0, 50, 100, 500, 1000].includes(Number(input.round)) ? Number(input.round) : 0;
  const where = ["p.active = 1"];
  const args: number[] = [];
  if (input.categoryId) {
    where.push("p.category_id = ?");
    args.push(Number(input.categoryId));
  }
  if (input.supplierId) {
    where.push(`${LAST_SUPPLIER_SQL} = ?`);
    args.push(Number(input.supplierId));
  }
  const list = getDb()
    .prepare(`SELECT p.id, p.name, p.unit, p.buy_price, p.sell_price FROM products p WHERE ${where.join(" AND ")} ORDER BY p.name LIMIT 3000`)
    .all(...args) as Array<{ id: number; name: string; unit: string; buy_price: number; sell_price: number }>;
  const skip = new Set((input.exclude || []).map(Number));
  const out: Array<{ id: number; name: string; unit: string; buy_price: number; old_price: number; new_price: number; below_cost: boolean }> = [];
  for (const p of list) {
    if (skip.has(p.id)) continue;
    let next: number;
    if (input.mode === "pct") next = p.sell_price * (1 + value / 100);
    else if (input.mode === "markup") {
      if (!(p.buy_price > 0)) continue;
      next = p.buy_price * (1 + value / 100);
    } else next = p.sell_price + value;
    next = step ? Math.round(next / step) * step : Math.round(next);
    if (next <= 0) next = step || 1;
    if (next === p.sell_price) continue;
    out.push({
      id: p.id,
      name: p.name,
      unit: p.unit,
      buy_price: p.buy_price,
      old_price: p.sell_price,
      new_price: next,
      below_cost: p.buy_price > 0 && next < p.buy_price,
    });
  }
  return out;
}

export function bulkPriceApply(input: BulkPriceInput, userId: number) {
  const rows = bulkPricePreview(input);
  if (!rows.length) return { changed: 0 };
  const db = getDb();
  const upd = db.prepare("UPDATE products SET sell_price = ? WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      upd.run(r.new_price, r.id);
      logPriceChange(db, r.id, { buy: r.buy_price, sell: r.old_price }, { buy: r.buy_price, sell: r.new_price }, "ommaviy", userId);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { changed: rows.length };
}

// ---------- Supplier reorder ----------

export type ReorderItem = {
  id: number;
  name: string;
  unit: string;
  stock: number;
  min_stock: number;
  per_day: number;
  buy_price: number;
  qty: number;
};

export type ReorderGroup = {
  supplier: { id: number; name: string; phone: string | null } | null;
  items: ReorderItem[];
};

const SALES_WINDOW_DAYS = 14;
const COVER_DAYS = 7;
const LOW_DAYS = 3;

export function reorderSuggestions(): ReorderGroup[] {
  const db = getDb();
  const since = new Date(Date.now() - SALES_WINDOW_DAYS * 86400000).toISOString();
  const list = db
    .prepare(
      `SELECT p.id, p.name, p.unit, p.stock, p.min_stock, p.buy_price,
              COALESCE((SELECT SUM(si.qty) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                        WHERE si.product_id = p.id AND s.created_at >= ?), 0) AS sold,
              ${LAST_SUPPLIER_SQL} AS supplier_id
       FROM products p
       WHERE p.active = 1 AND NOT EXISTS (SELECT 1 FROM bundle_items b WHERE b.bundle_id = p.id)`,
    )
    .all(since) as Array<{
    id: number;
    name: string;
    unit: string;
    stock: number;
    min_stock: number;
    buy_price: number;
    sold: number;
    supplier_id: number | null;
  }>;
  const suppliers = new Map(
    (db.prepare("SELECT id, name, phone FROM suppliers").all() as Array<{ id: number; name: string; phone: string | null }>).map((s) => [
      s.id,
      s,
    ]),
  );
  const groups = new Map<number, ReorderGroup>();
  for (const p of list) {
    const perDay = Number(p.sold) / SALES_WINDOW_DAYS;
    const stock = Number(p.stock);
    const min = Number(p.min_stock);
    const low = (min > 0 && stock <= min) || (perDay > 0 && stock < perDay * LOW_DAYS);
    if (!low) continue;
    const need = Math.max(min * 2, perDay * COVER_DAYS) - stock;
    const qty = p.unit === "dona" ? Math.max(1, Math.ceil(need)) : Math.max(0.5, Math.ceil(need * 2) / 2);
    const supplier = p.supplier_id ? suppliers.get(p.supplier_id) || null : null;
    const key = supplier?.id || 0;
    if (!groups.has(key)) groups.set(key, { supplier, items: [] });
    groups.get(key)!.items.push({
      id: p.id,
      name: p.name,
      unit: p.unit,
      stock,
      min_stock: min,
      per_day: Math.round(perDay * 10) / 10,
      buy_price: Number(p.buy_price),
      qty,
    });
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1) || (a.supplier?.name || "").localeCompare(b.supplier?.name || ""));
}
