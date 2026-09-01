import { DatabaseSync } from "node:sqlite";
import { productPrefix } from "./brand";
import { getDb, getProduct, getSettings } from "./db";
import { methodLabel, periodRange, som, tashkentDate, tashkentDateTime } from "./format";

type SqlRow = Record<string, unknown>;

const PHASE2 = "phase2-v1";

function row<T>(r: SqlRow | undefined) {
  return r as T | null;
}

function rows<T>(list: SqlRow[]) {
  return list as T[];
}

export function migratePhase2(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS discount_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
      value REAL NOT NULL,
      target TEXT NOT NULL DEFAULT 'all' CHECK (target IN ('all', 'category', 'product')),
      target_id INTEGER,
      min_qty REAL,
      min_amount INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discount_active ON discount_rules(active);
  `);
  const cols = ["expiry_date"];
  for (const col of cols) {
    const has = (
      db.prepare(`SELECT COUNT(*) AS c FROM pragma_table_info('products') WHERE name = ?`).get(col) as { c: number }
    ).c;
    if (!has) db.exec(`ALTER TABLE products ADD COLUMN ${col} TEXT`);
  }
  const hasBatchExpiry = (
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('stock_in_items') WHERE name = 'expiry_date'").get() as {
      c: number;
    }
  ).c;
  if (!hasBatchExpiry) db.exec("ALTER TABLE stock_in_items ADD COLUMN expiry_date TEXT");

  const defaults: Record<string, string> = {
    expiry_alert_days: "7",
    telegram_bot_token: "",
    telegram_chat_id: "",
    telegram_alerts_enabled: "0",
  };
  const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING");
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  const ver = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (ver?.value === PHASE2) return;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "schema_version",
    PHASE2,
  );
}

export type DiscountRule = {
  id: number;
  name: string;
  kind: "percent" | "fixed";
  value: number;
  target: "all" | "category" | "product";
  target_id: number | null;
  min_qty: number | null;
  min_amount: number | null;
  active: number;
  created_at: string;
};

export function listDiscountRules() {
  return rows<DiscountRule>(
    getDb().prepare("SELECT * FROM discount_rules ORDER BY id DESC").all(),
  );
}

export function createDiscountRule(input: {
  name: string;
  kind: "percent" | "fixed";
  value: number;
  target?: "all" | "category" | "product";
  target_id?: number | null;
  min_qty?: number | null;
  min_amount?: number | null;
}) {
  if (!input.name.trim()) throw new Error("Qoida nomi kerak");
  const info = getDb()
    .prepare(
      `INSERT INTO discount_rules (name, kind, value, target, target_id, min_qty, min_amount, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      input.name.trim(),
      input.kind,
      input.value,
      input.target || "all",
      input.target_id ?? null,
      input.min_qty ?? null,
      input.min_amount ?? null,
      new Date().toISOString(),
    );
  return row<DiscountRule>(getDb().prepare("SELECT * FROM discount_rules WHERE id = ?").get(Number(info.lastInsertRowid)));
}

export function updateDiscountRule(id: number, patch: Partial<DiscountRule> & { active?: boolean | number }) {
  const cur = row<DiscountRule>(getDb().prepare("SELECT * FROM discount_rules WHERE id = ?").get(id));
  if (!cur) throw new Error("Qoida topilmadi");
  getDb()
    .prepare(
      `UPDATE discount_rules SET name=?, kind=?, value=?, target=?, target_id=?, min_qty=?, min_amount=?, active=? WHERE id=?`,
    )
    .run(
      patch.name?.trim() || cur.name,
      patch.kind ?? cur.kind,
      patch.value ?? cur.value,
      patch.target ?? cur.target,
      patch.target_id !== undefined ? patch.target_id : cur.target_id,
      patch.min_qty !== undefined ? patch.min_qty : cur.min_qty,
      patch.min_amount !== undefined ? patch.min_amount : cur.min_amount,
      patch.active === undefined ? cur.active : patch.active ? 1 : 0,
      id,
    );
  return row<DiscountRule>(getDb().prepare("SELECT * FROM discount_rules WHERE id = ?").get(id));
}

export function deleteDiscountRule(id: number) {
  getDb().prepare("DELETE FROM discount_rules WHERE id = ?").run(id);
}

type CartLine = { product_id: number; qty: number; category_id?: number | null; sell_price?: number };

export function previewDiscounts(items: CartLine[]) {
  const rules = listDiscountRules().filter((r) => r.active);
  const enriched = items.map((it) => {
    const p = getProduct(it.product_id);
    return { ...it, category_id: p.category_id, sell_price: p.sell_price, name: p.name };
  });
  const subtotal = enriched.reduce((s, l) => s + Math.round(l.qty * l.sell_price), 0);
  const totalQty = enriched.reduce((s, l) => s + l.qty, 0);
  let saleDiscount = 0;
  const itemDiscounts: Record<number, number> = {};
  const applied: string[] = [];

  for (const rule of rules) {
    if (rule.min_qty && totalQty < rule.min_qty) continue;
    if (rule.min_amount && subtotal < rule.min_amount) continue;

    if (rule.target === "all") {
      const d = rule.kind === "percent" ? Math.round(subtotal * (rule.value / 100)) : Math.round(rule.value);
      if (d > saleDiscount) {
        saleDiscount = d;
        applied.push(rule.name);
      }
      continue;
    }

    for (const line of enriched) {
      const match =
        (rule.target === "product" && rule.target_id === line.product_id) ||
        (rule.target === "category" && rule.target_id === line.category_id);
      if (!match) continue;
      const lineTotal = Math.round(line.qty * line.sell_price);
      const d = rule.kind === "percent" ? Math.round(lineTotal * (rule.value / 100)) : Math.round(rule.value);
      itemDiscounts[line.product_id] = (itemDiscounts[line.product_id] || 0) + d;
      if (!applied.includes(rule.name)) applied.push(rule.name);
    }
  }

  const itemTotal = Object.values(itemDiscounts).reduce((s, v) => s + v, 0);
  return {
    subtotal,
    saleDiscount,
    itemDiscounts,
    totalDiscount: saleDiscount + itemTotal,
    total: Math.max(0, subtotal - saleDiscount - itemTotal),
    appliedRules: applied,
  };
}

export function listExpiringProducts(days?: number) {
  const settings = getSettings();
  const alertDays = days ?? Number(settings.expiry_alert_days || 7);
  const limitDate = addDays(tashkentDate(), alertDays);
  const productRows = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT p.id, p.name, p.stock, p.unit, p.expiry_date, p.sell_price, c.name AS category_name, 'product' AS source
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.active = 1 AND p.stock > 0 AND p.expiry_date IS NOT NULL AND p.expiry_date <= ?
         ORDER BY p.expiry_date ASC`,
      )
      .all(limitDate),
  );
  const batchRows = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT sii.product_id AS id, p.name, sii.qty AS stock, p.unit, sii.expiry_date, p.sell_price, c.name AS category_name, 'batch' AS source
         FROM stock_in_items sii
         JOIN products p ON p.id = sii.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE sii.expiry_date IS NOT NULL AND sii.expiry_date <= ? AND sii.qty > 0
         ORDER BY sii.expiry_date ASC`,
      )
      .all(limitDate),
  );
  return [...productRows, ...batchRows].map((r) => ({
    ...r,
    days_left: daysUntil(String(r.expiry_date)),
  }));
}

function addDays(isoDay: string, days: number) {
  const d = new Date(`${isoDay}T12:00:00+05:00`);
  d.setDate(d.getDate() + days);
  return tashkentDate(d);
}

function daysUntil(isoDay: string) {
  const today = new Date(`${tashkentDate()}T00:00:00+05:00`);
  const exp = new Date(`${isoDay}T00:00:00+05:00`);
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

export function getCustomerHistory(customerId: number) {
  const customer = row<SqlRow>(getDb().prepare("SELECT * FROM customers WHERE id = ?").get(customerId));
  if (!customer) throw new Error("Mijoz topilmadi");
  const sales = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT s.*, u.name AS cashier_name FROM sales s JOIN users u ON u.id = s.user_id
         WHERE s.customer_id = ? ORDER BY s.created_at DESC LIMIT 100`,
      )
      .all(customerId),
  );
  const payments = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT p.*, u.name AS user_name FROM payments p JOIN users u ON u.id = p.user_id
         WHERE p.kind = 'customer' AND p.party_id = ? ORDER BY p.created_at DESC LIMIT 50`,
      )
      .all(customerId),
  );
  const returns = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT sr.*, s.number AS sale_number FROM sale_returns sr
         JOIN sales s ON s.id = sr.sale_id WHERE s.customer_id = ? ORDER BY sr.created_at DESC LIMIT 50`,
      )
      .all(customerId),
  );
  const stats = getDb()
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS spent, COUNT(*) AS orders FROM sales WHERE customer_id = ?`,
    )
    .get(customerId) as { spent: number; orders: number };
  return { customer, sales, payments, returns, stats };
}

export function getShiftReport(shiftId: number) {
  const shift = row<SqlRow>(
    getDb()
      .prepare(`SELECT sh.*, u.name AS user_name FROM shifts sh JOIN users u ON u.id = sh.user_id WHERE sh.id = ?`)
      .get(shiftId),
  );
  if (!shift) throw new Error("Smena topilmadi");
  const sales = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT s.*, c.name AS customer_name FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.shift_id = ? ORDER BY s.created_at`,
      )
      .all(shiftId),
  );
  const returns = rows<SqlRow>(
    getDb().prepare("SELECT * FROM sale_returns WHERE shift_id = ? ORDER BY created_at").all(shiftId),
  );
  const byMethod = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT payment_method, COUNT(*) AS c, COALESCE(SUM(total),0) AS t FROM sales WHERE shift_id = ? GROUP BY payment_method`,
      )
      .all(shiftId),
  );
  const itemsSold = getDb()
    .prepare(
      `SELECT COALESCE(SUM(si.qty),0) AS q, COUNT(DISTINCT si.product_id) AS products
       FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.shift_id = ?`,
    )
    .get(shiftId) as { q: number; products: number };
  return { shift, sales, returns, byMethod, itemsSold };
}

export async function sendTelegram(text: string) {
  const settings = getSettings();
  const token = settings.telegram_bot_token?.trim();
  const chatId = settings.telegram_chat_id?.trim();
  if (!token || !chatId) throw new Error("Telegram sozlanmagan");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string };
  if (!data.ok) throw new Error(data.description || "Telegram xatolik");
  return { ok: true };
}

export function buildAlertMessage() {
  const settings = getSettings();
  const lines: string[] = [`<b>${productPrefix("ogohlantirish")}</b>`];
  const low = rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT name, stock, unit, min_stock FROM products WHERE active = 1 AND min_stock > 0 AND stock <= min_stock ORDER BY stock LIMIT 10`,
      )
      .all(),
  );
  if (low.length) {
    lines.push("\n<b>Kam qolgan:</b>");
    for (const p of low) lines.push(`• ${p.name}: ${p.stock} ${p.unit}`);
  }
  const expiring = listExpiringProducts();
  if (expiring.length) {
    lines.push("\n<b>Muddati yaqin:</b>");
    for (const p of expiring.slice(0, 10)) {
      const row = p as SqlRow;
      lines.push(`• ${row.name}: ${row.expiry_date} (${row.days_left} kun)`);
    }
  }
  if (lines.length === 1) lines.push("\nHozircha ogohlantirish yo'q.");
  return lines.join("\n");
}

export async function sendTelegramAlertsIfEnabled() {
  const settings = getSettings();
  if (settings.telegram_alerts_enabled !== "1") return { skipped: true };
  const msg = buildAlertMessage();
  if (msg.includes("Hozircha ogohlantirish yo'q")) return { skipped: true };
  await sendTelegram(msg);
  return { ok: true };
}

export const PHASE2_BACKUP_TABLES = ["discount_rules"];

export function shiftReportText(shiftId: number) {
  const r = getShiftReport(shiftId);
  const sh = r.shift as SqlRow;
  const lines = [
    `Smena hisoboti #${sh.id}`,
    `Kassir: ${sh.user_name}`,
    `Ochildi: ${tashkentDateTime(String(sh.opened_at))}`,
    sh.closed_at ? `Yopildi: ${tashkentDateTime(String(sh.closed_at))}` : "Holat: ochiq",
    `Savdolar: ${r.sales.length} ta, jami ${som(Number(sh.sales_total || 0))}`,
    `Qaytarish: ${r.returns.length} ta, jami ${som(Number(sh.returns_total || 0))}`,
    `Boshlang'ich naqd: ${som(Number(sh.opening_cash))}`,
  ];
  if (sh.expected_cash != null) lines.push(`Kutilgan naqd: ${som(Number(sh.expected_cash))}`);
  if (sh.closing_cash != null) lines.push(`Yakuniy naqd: ${som(Number(sh.closing_cash))}`);
  if (sh.difference != null) lines.push(`Farq: ${som(Number(sh.difference))}`);
  lines.push("\nTo'lov usullari:");
  for (const m of r.byMethod) lines.push(`  ${methodLabel(String(m.payment_method))}: ${som(Number(m.t))} (${m.c})`);
  return lines.join("\n");
}
