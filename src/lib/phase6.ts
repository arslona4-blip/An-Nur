import { DatabaseSync } from "node:sqlite";
import { addPayment, getDb, getProduct } from "./db";
import { periodRange } from "./format";

type SqlRow = Record<string, unknown>;

export function migratePhase6(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bundle_items (
      bundle_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      component_id INTEGER NOT NULL REFERENCES products(id),
      qty REAL NOT NULL,
      PRIMARY KEY (bundle_id, component_id)
    );
    CREATE INDEX IF NOT EXISTS idx_bundle_component ON bundle_items(component_id);
    CREATE TRIGGER IF NOT EXISTS trg_bundle_component AFTER UPDATE OF stock, buy_price ON products
    WHEN EXISTS (SELECT 1 FROM bundle_items WHERE component_id = NEW.id)
    BEGIN
      UPDATE products SET
        stock = (SELECT COALESCE(MIN(CAST(c.stock / bi.qty AS INTEGER)), 0)
                 FROM bundle_items bi JOIN products c ON c.id = bi.component_id WHERE bi.bundle_id = products.id),
        buy_price = (SELECT COALESCE(SUM(ROUND(c.buy_price * bi.qty)), 0)
                     FROM bundle_items bi JOIN products c ON c.id = bi.component_id WHERE bi.bundle_id = products.id)
      WHERE id IN (SELECT bundle_id FROM bundle_items WHERE component_id = NEW.id);
    END;
  `);
  const cols = new Set(
    (db.prepare("SELECT name FROM pragma_table_info('users')").all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has("commission_pct")) db.exec("ALTER TABLE users ADD COLUMN commission_pct REAL NOT NULL DEFAULT 0");
  if (!cols.has("commission_base")) db.exec("ALTER TABLE users ADD COLUMN commission_base TEXT NOT NULL DEFAULT 'savdo'");
}

export type BundlePart = { component_id: number; name: string; unit: string; qty: number; stock: number; buy_price: number };

export function bundleParts(productId: number) {
  return getDb()
    .prepare(
      `SELECT bi.component_id, p.name, p.unit, bi.qty, p.stock, p.buy_price
       FROM bundle_items bi JOIN products p ON p.id = bi.component_id WHERE bi.bundle_id = ? ORDER BY p.name`,
    )
    .all(productId) as BundlePart[];
}

export function isBundle(productId: number) {
  return !!getDb().prepare("SELECT 1 FROM bundle_items WHERE bundle_id = ? LIMIT 1").get(productId);
}

// A bundle has no stock of its own: selling or returning it moves the stock of what it is made of.
export function moveStock(db: DatabaseSync, productId: number, delta: number) {
  const parts = db.prepare("SELECT component_id, qty FROM bundle_items WHERE bundle_id = ?").all(productId) as SqlRow[];
  const upd = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
  if (!parts.length) {
    upd.run(delta, productId);
    return;
  }
  for (const p of parts) upd.run(delta * Number(p.qty), Number(p.component_id));
}

export function refreshBundle(db: DatabaseSync, bundleId: number) {
  db.prepare(
    `UPDATE products SET
       stock = (SELECT COALESCE(MIN(CAST(c.stock / bi.qty AS INTEGER)), 0)
                FROM bundle_items bi JOIN products c ON c.id = bi.component_id WHERE bi.bundle_id = products.id),
       buy_price = (SELECT COALESCE(SUM(ROUND(c.buy_price * bi.qty)), 0)
                    FROM bundle_items bi JOIN products c ON c.id = bi.component_id WHERE bi.bundle_id = products.id)
     WHERE id = ? AND EXISTS (SELECT 1 FROM bundle_items WHERE bundle_id = ?)`,
  ).run(bundleId, bundleId);
}

export function setBundle(bundleId: number, parts: Array<{ product_id: number; qty: number }>) {
  const db = getDb();
  const bundle = getProduct(bundleId);
  const usedIn = db.prepare("SELECT 1 FROM bundle_items WHERE component_id = ? LIMIT 1").get(bundleId);
  const clean = new Map<number, number>();
  for (const part of parts || []) {
    const id = Number(part.product_id);
    const qty = Number(part.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Tarkibdagi miqdor noto'g'ri");
    if (id === bundleId) throw new Error("To'plam o'zini o'z ichiga ololmaydi");
    const p = getProduct(id);
    if (isBundle(id)) throw new Error(`${p.name} o'zi to'plam — to'plam ichiga to'plam qo'shib bo'lmaydi`);
    clean.set(id, (clean.get(id) || 0) + qty);
  }
  if (clean.size && usedIn) throw new Error(`${bundle.name} boshqa to'plam tarkibida — uni to'plamga aylantirib bo'lmaydi`);
  if (clean.size === 1 && [...clean.values()][0] === 1) throw new Error("To'plamga kamida 2 dona yoki 2 xil mahsulot kiriting");
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM bundle_items WHERE bundle_id = ?").run(bundleId);
    const ins = db.prepare("INSERT INTO bundle_items (bundle_id, component_id, qty) VALUES (?, ?, ?)");
    for (const [id, qty] of clean) ins.run(bundleId, id, qty);
    if (!clean.size) db.prepare("UPDATE products SET stock = 0 WHERE id = ?").run(bundleId);
    refreshBundle(db, bundleId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return bundleParts(bundleId);
}

export const COMMISSION_BASES = ["savdo", "foyda"] as const;

const kpiTag = (startDay: string, endDay: string) => `Foiz ${startDay} — ${endDay}`;

export type KpiRow = {
  id: number;
  name: string;
  role: string;
  pct: number;
  base: string;
  count: number;
  sales: number;
  returns: number;
  net: number;
  profit: number;
  commission: number;
  paid: number;
  due: number;
};

export function sellerKpi(from?: string, to?: string) {
  const db = getDb();
  const { start, end, startDay, endDay } = periodRange(from, to);
  const sales = new Map(
    (
      db
        .prepare(
          `SELECT s.user_id, COUNT(*) AS c, SUM(s.total) AS t,
                  SUM((SELECT COALESCE(SUM(si.buy_price * si.qty), 0) FROM sale_items si WHERE si.sale_id = s.id)) AS cogs
           FROM sales s WHERE s.created_at >= ? AND s.created_at < ? GROUP BY s.user_id`,
        )
        .all(start, end) as SqlRow[]
    ).map((r) => [Number(r.user_id), r]),
  );
  const returns = new Map(
    (
      db
        .prepare(
          `SELECT s.user_id, SUM(r.total) AS t,
                  SUM((SELECT COALESCE(SUM(ri.qty * COALESCE(si.buy_price, 0)), 0)
                       FROM sale_return_items ri LEFT JOIN sale_items si ON si.id = ri.sale_item_id
                       WHERE ri.return_id = r.id)) AS cogs
           FROM sale_returns r JOIN sales s ON s.id = r.sale_id
           WHERE r.created_at >= ? AND r.created_at < ? GROUP BY s.user_id`,
        )
        .all(start, end) as SqlRow[]
    ).map((r) => [Number(r.user_id), r]),
  );
  const paid = new Map(
    (
      db
        .prepare(
          `SELECT party_id, SUM(amount) AS s FROM payments
           WHERE kind = 'expense' AND category = 'Oylik' AND note = ? GROUP BY party_id`,
        )
        .all(kpiTag(startDay, endDay)) as SqlRow[]
    ).map((r) => [Number(r.party_id), Number(r.s)]),
  );
  const users = db
    .prepare("SELECT id, name, role, active, commission_pct, commission_base FROM users ORDER BY id")
    .all() as SqlRow[];
  const out: KpiRow[] = [];
  for (const u of users) {
    const id = Number(u.id);
    const s = sales.get(id);
    const r = returns.get(id);
    const pct = Number(u.commission_pct) || 0;
    if (!s && !r && !pct) continue;
    if (!u.active && !s && !r) continue;
    const gross = Number(s?.t || 0);
    const back = Number(r?.t || 0);
    const net = gross - back;
    const profit = Math.round(net - Number(s?.cogs || 0) + Number(r?.cogs || 0));
    const base = String(u.commission_base) === "foyda" ? "foyda" : "savdo";
    const commission = Math.max(0, Math.round(((base === "foyda" ? profit : net) * pct) / 100));
    const already = paid.get(id) || 0;
    out.push({
      id,
      name: String(u.name),
      role: String(u.role),
      pct,
      base,
      count: Number(s?.c || 0),
      sales: gross,
      returns: back,
      net,
      profit,
      commission,
      paid: already,
      due: Math.max(0, commission - already),
    });
  }
  return { from: startDay, to: endDay, rows: out.sort((a, b) => b.net - a.net) };
}

export function payCommission(input: { adminId: number; userId: number; from: string; to: string; method?: string }) {
  const kpi = sellerKpi(input.from, input.to);
  const row = kpi.rows.find((r) => r.id === input.userId);
  if (!row) throw new Error("Xodim topilmadi");
  if (row.due <= 0) throw new Error("To'lanadigan foiz yo'q");
  addPayment({
    userId: input.adminId,
    kind: "expense",
    amount: row.due,
    method: input.method || "naqd",
    category: "Oylik",
    note: kpiTag(kpi.from, kpi.to),
    partyId: row.id,
  });
  getDb()
    .prepare("UPDATE payments SET party_name = ? WHERE id = (SELECT MAX(id) FROM payments WHERE party_id = ? AND category = 'Oylik')")
    .run(row.name, row.id);
  return sellerKpi(input.from, input.to);
}
