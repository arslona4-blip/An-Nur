import { DatabaseSync } from "node:sqlite";
import { getDb, getProduct, getSale, getSettings } from "./db";
import { periodRange, tashkentDate } from "./format";
import { moveStock } from "./phase6";

type SqlRow = Record<string, unknown>;

function row<T>(r: SqlRow | undefined) {
  return r as T | null;
}

function rows<T>(list: SqlRow[]) {
  return list as T[];
}

const PHASE1 = "phase1-v1";

export function migratePhase1(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      opening_cash INTEGER NOT NULL DEFAULT 0,
      closing_cash INTEGER,
      expected_cash INTEGER,
      difference INTEGER,
      sales_total INTEGER NOT NULL DEFAULT 0,
      returns_total INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))
    );
    CREATE TABLE IF NOT EXISTS sale_returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      sale_id INTEGER REFERENCES sales(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      shift_id INTEGER REFERENCES shifts(id),
      total INTEGER NOT NULL,
      refund_method TEXT NOT NULL DEFAULT 'naqd',
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
      sale_item_id INTEGER REFERENCES sale_items(id),
      product_id INTEGER REFERENCES products(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      qty REAL NOT NULL,
      sell_price INTEGER NOT NULL,
      total INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied')),
      note TEXT,
      created_at TEXT NOT NULL,
      applied_at TEXT
    );
    CREATE TABLE IF NOT EXISTS inventory_count_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      count_id INTEGER NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      system_qty REAL NOT NULL,
      actual_qty REAL NOT NULL,
      diff REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS waste_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      name TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      buy_price INTEGER NOT NULL,
      loss_amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
    CREATE INDEX IF NOT EXISTS idx_returns_created ON sale_returns(created_at);
  `);
  const hasShiftCol = (
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('sales') WHERE name = 'shift_id'").get() as { c: number }
  ).c;
  if (!hasShiftCol) db.exec("ALTER TABLE sales ADD COLUMN shift_id INTEGER REFERENCES shifts(id)");
  const ver = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (ver?.value === PHASE1) return;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "schema_version",
    PHASE1,
  );
}

function returnedQty(saleItemId: number) {
  const r = getDb()
    .prepare(
      `SELECT COALESCE(SUM(qty),0) AS q FROM sale_return_items sri
       JOIN sale_returns sr ON sr.id = sri.return_id WHERE sri.sale_item_id = ?`,
    )
    .get(saleItemId) as { q: number };
  return Number(r.q);
}

export function getOpenShift(userId?: number) {
  if (userId) {
    return row<SqlRow>(
      getDb().prepare("SELECT * FROM shifts WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(userId),
    );
  }
  return row<SqlRow>(getDb().prepare("SELECT * FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1").get());
}

export function openShift(userId: number, openingCash: number) {
  const open = getOpenShift(userId);
  if (open) throw new Error("Sizda ochiq smena bor. Avval yoping.");
  const info = getDb()
    .prepare(
      `INSERT INTO shifts (user_id, opened_at, opening_cash, status) VALUES (?, ?, ?, 'open')`,
    )
    .run(userId, new Date().toISOString(), Math.round(openingCash));
  return row<SqlRow>(getDb().prepare("SELECT * FROM shifts WHERE id = ?").get(Number(info.lastInsertRowid)));
}

export function closeShift(userId: number, closingCash: number, note?: string) {
  const shift = getOpenShift(userId);
  if (!shift) throw new Error("Ochiq smena topilmadi");
  const id = Number(shift.id);
  const sales = getDb()
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COALESCE(SUM(CASE WHEN payment_method='naqd' THEN paid - change_amount ELSE 0 END),0) AS naqd
       FROM sales WHERE shift_id = ?`,
    )
    .get(id) as { t: number; naqd: number };
  const returns = getDb()
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COALESCE(SUM(CASE WHEN refund_method='naqd' THEN total ELSE 0 END),0) AS naqd
       FROM sale_returns WHERE shift_id = ?`,
    )
    .get(id) as { t: number; naqd: number };
  const expected = Number(shift.opening_cash) + sales.naqd - returns.naqd;
  const closing = Math.round(closingCash);
  const diff = closing - expected;
  getDb()
    .prepare(
      `UPDATE shifts SET closed_at=?, closing_cash=?, expected_cash=?, difference=?, sales_total=?, returns_total=?, note=?, status='closed' WHERE id=?`,
    )
    .run(new Date().toISOString(), closing, expected, diff, sales.t, returns.t, note || null, id);
  return row<SqlRow>(getDb().prepare("SELECT * FROM shifts WHERE id = ?").get(id));
}

export function listShifts(limit = 30) {
  return rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT sh.*, u.name AS user_name,
           CASE WHEN sh.status = 'open'
             THEN (SELECT COALESCE(SUM(total),0) FROM sales WHERE shift_id = sh.id) ELSE sh.sales_total END AS sales_total
         FROM shifts sh JOIN users u ON u.id = sh.user_id ORDER BY sh.id DESC LIMIT ?`,
      )
      .all(limit),
  );
}

export function findSaleByNumber(number: string) {
  const sale = row<SqlRow>(getDb().prepare("SELECT id FROM sales WHERE number = ?").get(number.trim()));
  if (!sale) throw new Error("Savdo topilmadi");
  const full = getSale(Number(sale.id));
  const items = full.items.map((it: SqlRow) => ({
    ...it,
    returned: returnedQty(Number(it.id)),
  }));
  return { ...full, items };
}

export function createReturn(input: {
  userId: number;
  saleId: number;
  refundMethod: string;
  note?: string;
  items: Array<{ sale_item_id: number; qty: number }>;
}) {
  if (!input.items?.length) throw new Error("Qaytariladigan mahsulot tanlang");
  const db = getDb();
  const sale = getSale(input.saleId);
  const shift = getOpenShift(input.userId);
  db.exec("BEGIN");
  try {
    const itemsSum = Number(
      (db.prepare("SELECT COALESCE(SUM(total),0) AS s FROM sale_items WHERE sale_id = ?").get(input.saleId) as { s: number })
        .s,
    );
    const saleShare = itemsSum > 0 ? Math.min(1, Number((sale as SqlRow).total) / itemsSum) : 1;
    let total = 0;
    const lines: Array<{
      sale_item_id: number;
      product_id: number | null;
      name: string;
      unit: string;
      qty: number;
      sell_price: number;
      total: number;
    }> = [];
    for (const item of input.items) {
      const si = row<SqlRow>(db.prepare("SELECT * FROM sale_items WHERE id = ? AND sale_id = ?").get(item.sale_item_id, input.saleId));
      if (!si) throw new Error("Savdo qatori topilmadi");
      const already = returnedQty(item.sale_item_id);
      const max = Number(si.qty) - already;
      if (!Number.isFinite(item.qty) || item.qty <= 0 || item.qty > max + 1e-9) {
        throw new Error(`${si.name}: maksimum ${max} qaytarish mumkin`);
      }
      const paidPerUnit = Number(si.qty) > 0 ? Number(si.total) / Number(si.qty) : Number(si.sell_price);
      const lineTotal = Math.round(item.qty * paidPerUnit * saleShare);
      total += lineTotal;
      lines.push({
        sale_item_id: item.sale_item_id,
        product_id: si.product_id == null ? null : Number(si.product_id),
        name: String(si.name),
        unit: String(si.unit),
        qty: item.qty,
        sell_price: Number(si.sell_price),
        total: lineTotal,
      });
    }
    const day = tashkentDate().replace(/-/g, "");
    const count = (db.prepare("SELECT COUNT(*) AS c FROM sale_returns WHERE number LIKE ?").get(`Q-${day}-%`) as { c: number }).c;
    const number = `Q-${day}-${String(count + 1).padStart(4, "0")}`;
    const info = db
      .prepare(
        `INSERT INTO sale_returns (number, sale_id, user_id, shift_id, total, refund_method, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        number,
        input.saleId,
        input.userId,
        shift ? Number(shift.id) : null,
        total,
        input.refundMethod,
        input.note || null,
        new Date().toISOString(),
      );
    const returnId = Number(info.lastInsertRowid);
    const itemStmt = db.prepare(
      `INSERT INTO sale_return_items (return_id, sale_item_id, product_id, name, unit, qty, sell_price, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const line of lines) {
      itemStmt.run(returnId, line.sale_item_id, line.product_id, line.name, line.unit, line.qty, line.sell_price, line.total);
      if (line.product_id !== null) moveStock(db, line.product_id, line.qty);
    }
    if (String((sale as SqlRow).payment_method) === "qarz" && (sale as SqlRow).customer_id && input.refundMethod === "qarz") {
      const debtReduce = Math.min(total, Number((sale as SqlRow).debt_amount || 0));
      if (debtReduce > 0) {
        db.prepare("UPDATE customers SET debt = CASE WHEN debt > ? THEN debt - ? ELSE 0 END WHERE id = ?").run(
          debtReduce,
          debtReduce,
          (sale as SqlRow).customer_id,
        );
      }
    }
    db.exec("COMMIT");
    return getReturn(returnId);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getReturn(id: number) {
  const r = row<SqlRow>(
    getDb()
      .prepare(
        `SELECT sr.*, s.number AS sale_number, u.name AS user_name
         FROM sale_returns sr JOIN sales s ON s.id = sr.sale_id JOIN users u ON u.id = sr.user_id WHERE sr.id = ?`,
      )
      .get(id),
  );
  if (!r) throw new Error("Qaytarish topilmadi");
  const items = getDb().prepare("SELECT * FROM sale_return_items WHERE return_id = ?").all(id);
  return { ...r, items };
}

export function listReturns(from?: string, to?: string) {
  const { start, end } = periodRange(from, to);
  return rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT sr.*, s.number AS sale_number, u.name AS user_name
         FROM sale_returns sr JOIN sales s ON s.id = sr.sale_id JOIN users u ON u.id = sr.user_id
         WHERE sr.created_at >= ? AND sr.created_at < ? ORDER BY sr.created_at DESC`,
      )
      .all(start, end),
  );
}

export function createInventoryCount(userId: number, note?: string) {
  const db = getDb();
  const products = rows<SqlRow>(
    db
      .prepare(
        "SELECT id, name, unit, stock FROM products WHERE active = 1 AND id NOT IN (SELECT bundle_id FROM bundle_items) ORDER BY name",
      )
      .all(),
  );
  const day = tashkentDate().replace(/-/g, "");
  const count = (db.prepare("SELECT COUNT(*) AS c FROM inventory_counts WHERE number LIKE ?").get(`I-${day}-%`) as { c: number }).c;
  const number = `I-${day}-${String(count + 1).padStart(4, "0")}`;
  db.exec("BEGIN");
  try {
    const info = db
      .prepare(`INSERT INTO inventory_counts (number, user_id, status, note, created_at) VALUES (?, ?, 'draft', ?, ?)`)
      .run(number, userId, note || null, new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    const stmt = db.prepare(
      `INSERT INTO inventory_count_items (count_id, product_id, name, unit, system_qty, actual_qty, diff)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    );
    for (const p of products) {
      const stock = Number(p.stock);
      stmt.run(id, p.id, p.name, p.unit, stock, stock);
    }
    db.exec("COMMIT");
    return getInventoryCount(id);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getInventoryCount(id: number) {
  const c = row<SqlRow>(
    getDb()
      .prepare(
        `SELECT ic.*, u.name AS user_name FROM inventory_counts ic JOIN users u ON u.id = ic.user_id WHERE ic.id = ?`,
      )
      .get(id),
  );
  if (!c) throw new Error("Inventar topilmadi");
  const items = getDb().prepare("SELECT * FROM inventory_count_items WHERE count_id = ? ORDER BY name").all(id);
  return { ...c, items };
}

export function listInventoryCounts() {
  return rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT ic.*, u.name AS user_name FROM inventory_counts ic JOIN users u ON u.id = ic.user_id ORDER BY ic.id DESC LIMIT 50`,
      )
      .all(),
  );
}

export function updateInventoryItem(countId: number, productId: number, actualQty: number) {
  const c = row<SqlRow>(getDb().prepare("SELECT status FROM inventory_counts WHERE id = ?").get(countId));
  if (!c || c.status !== "draft") throw new Error("Faqat qoralama inventar tahrirlanadi");
  const item = row<SqlRow>(
    getDb().prepare("SELECT system_qty FROM inventory_count_items WHERE count_id = ? AND product_id = ?").get(countId, productId),
  );
  if (!item) throw new Error("Mahsulot topilmadi");
  if (!Number.isFinite(actualQty) || actualQty < 0) throw new Error("Miqdor noto'g'ri");
  const diff = actualQty - Number(item.system_qty);
  getDb()
    .prepare("UPDATE inventory_count_items SET actual_qty = ?, diff = ? WHERE count_id = ? AND product_id = ?")
    .run(actualQty, diff, countId, productId);
  return getInventoryCount(countId);
}

export function applyInventoryCount(countId: number) {
  const db = getDb();
  const c = row<SqlRow>(db.prepare("SELECT status FROM inventory_counts WHERE id = ?").get(countId));
  if (!c || c.status !== "draft") throw new Error("Inventar allaqachon qo'llangan");
  const items = db.prepare("SELECT * FROM inventory_count_items WHERE count_id = ? AND ABS(diff) > 0.0001").all(countId);
  db.exec("BEGIN");
  try {
    // Apply the difference, not the counted figure: sales made while counting have already moved the stock.
    const upd = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
    for (const item of items) {
      upd.run(Number(item.diff), item.product_id);
    }
    db.prepare("UPDATE inventory_counts SET status = 'applied', applied_at = ? WHERE id = ?").run(new Date().toISOString(), countId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return getInventoryCount(countId);
}

export const WASTE_REASONS = ["Muddati o'tgan", "Singan", "Buzilgan", "Namunalik", "Boshqa"] as const;

export function createWaste(input: {
  userId: number;
  productId: number;
  qty: number;
  reason: string;
  note?: string;
}) {
  const db = getDb();
  const p = getProduct(input.productId);
  if (input.qty <= 0) throw new Error("Miqdor noto'g'ri");
  const settings = getSettings();
  if (settings.allow_negative_stock !== "1" && p.stock + 1e-9 < input.qty) {
    throw new Error(`Omborda yetarli emas (${p.stock} ${p.unit})`);
  }
  const loss = Math.round(input.qty * p.buy_price);
  const day = tashkentDate().replace(/-/g, "");
  const count = (db.prepare("SELECT COUNT(*) AS c FROM waste_records WHERE number LIKE ?").get(`Y-${day}-%`) as { c: number }).c;
  const number = `Y-${day}-${String(count + 1).padStart(4, "0")}`;
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO waste_records (number, user_id, product_id, name, qty, unit, buy_price, loss_amount, reason, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      number,
      input.userId,
      p.id,
      p.name,
      input.qty,
      p.unit,
      p.buy_price,
      loss,
      input.reason,
      input.note || null,
      new Date().toISOString(),
    );
    moveStock(db, p.id, -input.qty);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return listWaste();
}

export function listWaste(from?: string, to?: string) {
  const { start, end } = periodRange(from, to);
  return rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT w.*, u.name AS user_name FROM waste_records w JOIN users u ON u.id = w.user_id
         WHERE w.created_at >= ? AND w.created_at < ? ORDER BY w.created_at DESC LIMIT 200`,
      )
      .all(start, end),
  );
}

const BACKUP_TABLES = [
  "users",
  "settings",
  "categories",
  "products",
  "bundle_items",
  "customers",
  "suppliers",
  "sales",
  "sale_items",
  "stock_ins",
  "stock_in_items",
  "payments",
  "shifts",
  "sale_returns",
  "sale_return_items",
  "inventory_counts",
  "inventory_count_items",
  "waste_records",
  "discount_rules",
  "delivery_orders",
  "delivery_order_items",
  "branches",
  "sms_log",
  "offline_queue",
];

export function restoreBackup(payload: { app?: string; data?: Record<string, SqlRow[]> }) {
  if (payload.app !== "hisob" || !payload.data) throw new Error("Noto'g'ri zaxira fayli");
  const db = getDb();
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN");
  try {
    for (const t of [...BACKUP_TABLES].reverse()) {
      try {
        db.exec(`DELETE FROM ${t}`);
      } catch {
        /* jadval yo'q */
      }
    }
    for (const t of BACKUP_TABLES) {
      const rowsData = payload.data[t];
      if (!rowsData?.length) continue;
      const cols = Object.keys(rowsData[0]);
      const placeholders = cols.map(() => "?").join(", ");
      const stmt = db.prepare(`INSERT INTO ${t} (${cols.join(", ")}) VALUES (${placeholders})`);
      for (const r of rowsData) stmt.run(...cols.map((c) => r[c]));
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
  return { ok: true };
}

export function exportSalesCsv(from?: string, to?: string) {
  const range = periodRange(from, to);
  const sales = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT s.number, s.created_at, u.name AS cashier, s.payment_method, s.total, s.discount, c.name AS customer
         FROM sales s JOIN users u ON u.id = s.user_id LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at`,
      )
      .all(range.start, range.end),
  );
  const header = "Chek,Sana,Kassir,To'lov,Jami,Chegirma,Mijoz\n";
  const lines = sales.map(
    (s) =>
      `${s.number},${s.created_at},${csvEsc(String(s.cashier))},${s.payment_method},${s.total},${s.discount},${csvEsc(String(s.customer || ""))}`,
  );
  return header + lines.join("\n");
}

export function exportProductsCsv() {
  const products = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT p.sku, p.barcode, p.name, c.name AS category, p.unit, p.buy_price, p.sell_price, p.stock, p.min_stock
         FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name`,
      )
      .all(),
  );
  const header = "SKU,Shtrix,Nomi,Kategoriya,O'lchov,Olish,Sotish,Ombor,Min\n";
  const lines = products.map(
    (p) =>
      `${p.sku},${p.barcode || ""},${csvEsc(String(p.name))},${csvEsc(String(p.category || ""))},${p.unit},${p.buy_price},${p.sell_price},${p.stock},${p.min_stock}`,
  );
  return header + lines.join("\n");
}

function csvEsc(v: string) {
  // Excel runs cells starting with these as formulas.
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function exportReportsCsv(from?: string, to?: string) {
  const range = periodRange(from, to);
  const sales = getDb()
    .prepare("SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales WHERE created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { t: number; c: number };
  const returns = getDb()
    .prepare("SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sale_returns WHERE created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { t: number; c: number };
  const waste = getDb()
    .prepare("SELECT COALESCE(SUM(loss_amount),0) AS s FROM waste_records WHERE created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { s: number };
  const deliveries = getDb()
    .prepare(
      "SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM delivery_orders WHERE status = 'done' AND delivered_at >= ? AND delivered_at < ?",
    )
    .get(range.start, range.end) as { t: number; c: number };
  return [
    "Hisobot",
    `Davr,${range.startDay},${range.endDay}`,
    `Savdo,${sales.t},${sales.c} ta chek`,
    `Yetkazib berish,${deliveries.t},${deliveries.c} ta`,
    `Qaytarish,${returns.t},${returns.c} ta`,
    `Yo'qotish,${waste.s},`,
  ].join("\n");
}

export function linkSaleToShift(saleId: number, userId: number) {
  const shift = getOpenShift(userId);
  if (!shift) return;
  getDb().prepare("UPDATE sales SET shift_id = ? WHERE id = ?").run(Number(shift.id), saleId);
}

export { BACKUP_TABLES };
