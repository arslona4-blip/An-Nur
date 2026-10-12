import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import {
  FOOD_CATEGORIES,
  FOOD_PRODUCTS,
  FOOD_SALES,
  FOOD_SETTINGS,
  FOOD_SUPPLIERS,
} from "./catalog";
import { dayRange, periodRange, tashkentDate } from "./format";
import { linkSaleToShift, migratePhase1 } from "./phase1";
import { listExpiringProducts, migratePhase2, previewDiscounts } from "./phase2";
import { migratePhase3 } from "./phase3";
import { buildFiscalQr, getCurrentBranchId, migratePhase4 } from "./phase4";
import { assertLicensed } from "./license";
import { migratePhase5 } from "./phase5";

type SqlRow = Record<string, unknown>;

const globalForDb = globalThis as unknown as { hisobDb?: DatabaseSync };

function dbPath() {
  const dir = process.env.ANNUR_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(dir, "hisob.db");
}

export function getDb() {
  if (!globalForDb.hisobDb) {
    fs.mkdirSync(path.dirname(dbPath()), { recursive: true });
    const db = new DatabaseSync(dbPath());
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
    seed(db);
    migratePhase1(db);
    migratePhase2(db);
    migratePhase3(db);
    migratePhase4(db);
    migratePhase5(db);
    globalForDb.hisobDb = db;
  }
  ensureFoodCatalog(globalForDb.hisobDb);
  migratePhase1(globalForDb.hisobDb);
  migratePhase2(globalForDb.hisobDb);
  migratePhase3(globalForDb.hisobDb);
  migratePhase4(globalForDb.hisobDb);
  migratePhase5(globalForDb.hisobDb);
  return globalForDb.hisobDb;
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'kassir')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#0f766e',
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      barcode TEXT,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      unit TEXT NOT NULL DEFAULT 'dona',
      buy_price INTEGER NOT NULL DEFAULT 0,
      sell_price INTEGER NOT NULL DEFAULT 0,
      stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      debt INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      payable INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      customer_id INTEGER REFERENCES customers(id),
      payment_method TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      discount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL,
      paid INTEGER NOT NULL,
      change_amount INTEGER NOT NULL DEFAULT 0,
      debt_amount INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      qty REAL NOT NULL,
      buy_price INTEGER NOT NULL,
      sell_price INTEGER NOT NULL,
      discount INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_ins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      total INTEGER NOT NULL,
      paid INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stock_in_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_in_id INTEGER NOT NULL REFERENCES stock_ins(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      name TEXT NOT NULL,
      qty REAL NOT NULL,
      buy_price INTEGER NOT NULL,
      sell_price INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      party_id INTEGER,
      party_name TEXT,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT 'naqd',
      category TEXT,
      note TEXT,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
  `);
  const hasFlag = (
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('users') WHERE name = 'must_change_password'").get() as {
      c: number;
    }
  ).c;
  if (!hasFlag) {
    db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0");
    const users = db.prepare("SELECT id, password_hash FROM users").all() as { id: number; password_hash: string }[];
    const flag = db.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?");
    for (const u of users) {
      if (DEFAULT_PASSWORDS.some((p) => bcrypt.compareSync(p, u.password_hash))) flag.run(u.id);
    }
  }
  const hasClientId = (
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('sales') WHERE name = 'client_id'").get() as { c: number }
  ).c;
  if (!hasClientId) db.exec("ALTER TABLE sales ADD COLUMN client_id TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_id ON sales(client_id) WHERE client_id IS NOT NULL");
}

export const DEFAULT_PASSWORDS = ["admin123", "kassir123"];

function checkNewPassword(password: string) {
  if (password.length < 6) throw new Error("Parol kamida 6 belgidan iborat bo‘lsin");
  if (DEFAULT_PASSWORDS.includes(password)) throw new Error("Bu parol hammaga ma'lum, boshqasini tanlang");
}

function seed(db: DatabaseSync) {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (existing.c > 0) return;

  const now = new Date().toISOString();
  const adminHash = bcrypt.hashSync("admin123", 10);
  const kassirHash = bcrypt.hashSync("kassir123", 10);

  db.prepare(
    "INSERT INTO users (username, password_hash, name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
  ).run("admin", adminHash, "Do'kon egasi", "admin", now);
  db.prepare(
    "INSERT INTO users (username, password_hash, name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
  ).run("kassir", kassirHash, "Sotuvchi", "kassir", now);
  db.exec("UPDATE users SET must_change_password = 1");

  const setStmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(FOOD_SETTINGS)) setStmt.run(key, value);

  seedFoodCatalog(db, now);
}

function ensureFoodCatalog(db: DatabaseSync) {
  const rowv = db.prepare("SELECT value FROM settings WHERE key = 'catalog_version'").get() as
    | { value: string }
    | undefined;
  if (rowv?.value === FOOD_SETTINGS.catalog_version) return;
  const live = db.prepare("SELECT value FROM settings WHERE key = 'store_live'").get() as { value: string } | undefined;
  const hasData = (db.prepare("SELECT EXISTS(SELECT 1 FROM sales) OR EXISTS(SELECT 1 FROM products) AS x").get() as {
    x: number;
  }).x;
  // A store that never pressed "reset" may still hold real sales; an app update must never wipe them.
  if (live?.value === "1" || hasData) {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('catalog_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(FOOD_SETTINGS.catalog_version);
    return;
  }
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM stock_in_items;
    DELETE FROM stock_ins;
    DELETE FROM payments;
    DELETE FROM products;
    DELETE FROM categories;
    DELETE FROM customers;
    DELETE FROM suppliers;
  `);
  db.exec("PRAGMA foreign_keys = ON;");
  const upsert = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(FOOD_SETTINGS)) upsert.run(key, value);
  seedFoodCatalog(db, new Date().toISOString());
}

const STORE_DATA_TABLES = [
  "sale_return_items",
  "sale_returns",
  "sale_items",
  "sales",
  "shifts",
  "stock_in_items",
  "stock_ins",
  "inventory_count_items",
  "inventory_counts",
  "waste_records",
  "delivery_order_items",
  "delivery_orders",
  "payments",
  "discount_rules",
  "sms_log",
  "offline_queue",
  "telegram_sessions",
  "products",
  "customers",
  "suppliers",
];

export function resetStoreData() {
  const db = getDb();
  const existing = new Set(
    rows<{ name: string }>(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).map((t) => t.name),
  );
  db.exec("PRAGMA foreign_keys = OFF;");
  try {
    db.exec("BEGIN");
    for (const table of STORE_DATA_TABLES) {
      if (existing.has(table)) db.exec(`DELETE FROM ${table}`);
    }
    if (existing.has("sqlite_sequence")) {
      const names = STORE_DATA_TABLES.map((t) => `'${t}'`).join(",");
      db.exec(`DELETE FROM sqlite_sequence WHERE name IN (${names})`);
    }
    const upsert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    upsert.run("store_live", "1");
    upsert.run("catalog_version", FOOD_SETTINGS.catalog_version);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON;");
  }
}

function seedFoodCatalog(db: DatabaseSync, now: string) {
  const catStmt = db.prepare("INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)");
  const catIds = new Map<string, number>();
  FOOD_CATEGORIES.forEach((c, i) => {
    const info = catStmt.run(c.name, c.color, i + 1);
    catIds.set(c.name, Number(info.lastInsertRowid));
  });

  const pStmt = db.prepare(
    `INSERT INTO products (sku, barcode, name, category_id, unit, buy_price, sell_price, stock, min_stock, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  FOOD_PRODUCTS.forEach((p, i) => {
    const sku = `HIS-${String(i + 1).padStart(4, "0")}`;
    pStmt.run(sku, p[0], p[1], catIds.get(p[2]) || null, p[3], p[4], p[5], p[6], p[7], now);
  });

  db.prepare(
    "INSERT INTO customers (name, phone, debt, note, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("Ahmad Karimov", "+998901112233", 150000, "Doimiy mijoz — non va sut", now);
  db.prepare(
    "INSERT INTO customers (name, phone, debt, note, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("Dilnoza Yusupova", "+998907778899", 0, "", now);
  db.prepare(
    "INSERT INTO customers (name, phone, debt, note, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("Rustam Aliyev", "+998933334455", 85000, "Ichimliklar ulgurji", now);

  const sStmt = db.prepare(
    "INSERT INTO suppliers (name, phone, payable, created_at) VALUES (?, ?, ?, ?)",
  );
  for (const s of FOOD_SUPPLIERS) sStmt.run(s.name, s.phone, s.payable, now);

  db.prepare(
    `INSERT INTO payments (kind, party_name, amount, method, category, note, user_id, created_at)
     VALUES ('expense', NULL, 400000, 'naqd', 'Ijara', 'Oylik ijara', 1, ?)`,
  ).run(daysAgo(3));

  const productByBarcode = db.prepare("SELECT * FROM products WHERE barcode = ?");
  const saleStmt = db.prepare(
    `INSERT INTO sales (number, user_id, customer_id, payment_method, subtotal, discount, total, paid, change_amount, debt_amount, created_at)
     VALUES (?, ?, NULL, ?, ?, 0, ?, ?, 0, 0, ?)`,
  );
  const itemStmt = db.prepare(
    `INSERT INTO sale_items (sale_id, product_id, name, unit, qty, buy_price, sell_price, discount, total)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  );
  const stockStmt = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");

  FOOD_SALES.forEach((sale, idx) => {
    const created = daysAgo(sale.ago);
    let subtotal = 0;
    const lines: Array<{
      id: number;
      name: string;
      unit: string;
      qty: number;
      buy: number;
      sell: number;
      total: number;
    }> = [];
    for (const [barcode, q] of sale.barcodes) {
      const p = productByBarcode.get(barcode) as SqlRow | undefined;
      if (!p) continue;
      const total = Math.round(Number(p.sell_price) * q);
      subtotal += total;
      lines.push({
        id: Number(p.id),
        name: String(p.name),
        unit: String(p.unit),
        qty: q,
        buy: Number(p.buy_price),
        sell: Number(p.sell_price),
        total,
      });
    }
    if (!lines.length) return;
    const number = `S-${tashkentDate(new Date(created)).replace(/-/g, "")}-${String(idx + 1).padStart(4, "0")}`;
    const paid = sale.method === "qarz" ? 0 : subtotal;
    const info = saleStmt.run(number, 1, sale.method, subtotal, subtotal, paid, created);
    const saleId = Number(info.lastInsertRowid);
    for (const line of lines) {
      itemStmt.run(saleId, line.id, line.name, line.unit, line.qty, line.buy, line.sell, line.total);
      stockStmt.run(line.qty, line.id);
    }
  });
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(14, 20, 0, 0);
  return d.toISOString();
}

function row<T>(r: SqlRow | undefined) {
  return r as T | undefined;
}

function rows<T>(list: SqlRow[]) {
  return list as T[];
}

export function getSettings() {
  const list = getDb().prepare("SELECT key, value FROM settings").all();
  const out: Record<string, string> = {};
  for (const item of list) out[String(item.key)] = String(item.value);
  return out;
}

export function setSettings(patch: Record<string, string>) {
  const stmt = getDb().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(patch)) {
    if (key.startsWith("license_")) continue;
    stmt.run(key, String(value ?? ""));
  }
  return getSettings();
}

export type UserRow = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "kassir";
  active: number;
  created_at: string;
  password_hash?: string;
  must_change_password?: number;
};

export function findUserByUsername(username: string) {
  return row<UserRow>(
    getDb().prepare("SELECT * FROM users WHERE username = ?").get(username.trim().toLowerCase()),
  );
}

export function verifyLogin(username: string, password: string) {
  const user = findUserByUsername(username);
  if (!user || !user.active) return null;
  if (!bcrypt.compareSync(password, user.password_hash || "")) return null;
  const { password_hash: _, ...safe } = user;
  return safe;
}

export function listUsers() {
  return rows<UserRow>(
    getDb().prepare("SELECT id, username, name, role, active, created_at FROM users ORDER BY id").all(),
  );
}

export function createUser(input: {
  username: string;
  password: string;
  name: string;
  role: "admin" | "kassir";
}) {
  const username = input.username.trim().toLowerCase();
  if (!username || !input.password || !input.name.trim()) throw new Error("Maydonlar to'ldirilishi shart");
  checkNewPassword(input.password);
  try {
    getDb()
      .prepare(
        "INSERT INTO users (username, password_hash, name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      )
      .run(username, bcrypt.hashSync(input.password, 10), input.name.trim(), input.role, new Date().toISOString());
  } catch {
    throw new Error("Bu login band");
  }
  return listUsers();
}

export function updateUser(
  id: number,
  patch: { name?: string; role?: "admin" | "kassir"; active?: boolean; password?: string },
) {
  const user = row<UserRow>(getDb().prepare("SELECT * FROM users WHERE id = ?").get(id));
  if (!user) throw new Error("Xodim topilmadi");
  const name = patch.name?.trim() || user.name;
  const role = patch.role || user.role;
  const active = patch.active === undefined ? user.active : patch.active ? 1 : 0;
  if (user.role === "admin" && user.active && (role !== "admin" || !active)) {
    const others = row<{ n: number }>(
      getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(id),
    );
    if (!others?.n) throw new Error("Kamida bitta faol administrator qolishi kerak");
  }
  if (patch.password) checkNewPassword(patch.password);
  getDb().prepare("UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?").run(name, role, active, id);
  if (patch.password) {
    getDb()
      .prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?")
      .run(bcrypt.hashSync(patch.password, 10), id);
  }
  return listUsers();
}

export function changeOwnPassword(id: number, current: string, next: string) {
  const user = row<UserRow>(getDb().prepare("SELECT * FROM users WHERE id = ?").get(id));
  if (!user || !user.active) throw new Error("Xodim topilmadi");
  if (!bcrypt.compareSync(current, user.password_hash || "")) throw new Error("Joriy parol noto'g'ri");
  if (current === next) throw new Error("Yangi parol eskisidan farq qilsin");
  checkNewPassword(next);
  getDb()
    .prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?")
    .run(bcrypt.hashSync(next, 10), id);
}

export type Category = { id: number; name: string; color: string; sort: number };

export function listCategories() {
  return rows<Category>(getDb().prepare("SELECT * FROM categories ORDER BY sort, id").all());
}

export function createCategory(name: string, color = "#0f766e") {
  if (!name.trim()) throw new Error("Kategoriya nomi kerak");
  getDb()
    .prepare("INSERT INTO categories (name, color, sort) VALUES (?, ?, ?)")
    .run(name.trim(), color, listCategories().length + 1);
  return listCategories();
}

export function deleteCategory(id: number) {
  const used = getDb().prepare("SELECT COUNT(*) AS c FROM products WHERE category_id = ?").get(id) as { c: number };
  if (used.c > 0) throw new Error("Bu kategoriyada mahsulotlar bor");
  getDb().prepare("DELETE FROM categories WHERE id = ?").run(id);
  return listCategories();
}

export type Product = {
  id: number;
  sku: string | null;
  barcode: string | null;
  name: string;
  category_id: number | null;
  category_name: string | null;
  unit: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock: number;
  active: number;
  expiry_date: string | null;
  image_url: string | null;
  created_at: string;
};

export function listProducts(opts?: { q?: string; categoryId?: number; includeInactive?: boolean }) {
  let sql = `SELECT p.*, c.name AS category_name
             FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE 1=1`;
  const params: unknown[] = [];
  if (!opts?.includeInactive) {
    sql += " AND p.active = 1";
  }
  if (opts?.categoryId) {
    sql += " AND p.category_id = ?";
    params.push(opts.categoryId);
  }
  if (opts?.q?.trim()) {
    const q = `%${opts.q.trim()}%`;
    sql += " AND (p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)";
    params.push(q, q, q);
  }
  sql += " ORDER BY p.name";
  return rows<Product>(getDb().prepare(sql).all(...params));
}

export function topSellingProducts(limit = 12) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  return rows<Product>(
    getDb()
      .prepare(
        `SELECT p.*, c.name AS category_name
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE s.created_at >= ? AND p.active = 1
         GROUP BY p.id ORDER BY COUNT(*) DESC, p.name LIMIT ?`,
      )
      .all(since, Math.max(1, Math.min(24, limit))),
  );
}

export function createProduct(input: {
  name: string;
  barcode?: string;
  category_id?: number | null;
  unit?: string;
  buy_price?: number;
  sell_price?: number;
  stock?: number;
  min_stock?: number;
  expiry_date?: string | null;
  image_url?: string | null;
}) {
  if (!input.name.trim()) throw new Error("Mahsulot nomi kerak");
  const count = (getDb().prepare("SELECT COUNT(*) AS c FROM products").get() as { c: number }).c;
  const sku = `HIS-${String(count + 1).padStart(4, "0")}`;
  const info = getDb()
    .prepare(
      `INSERT INTO products (sku, barcode, name, category_id, unit, buy_price, sell_price, stock, min_stock, expiry_date, image_url, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      sku,
      input.barcode?.trim() || null,
      input.name.trim(),
      input.category_id || null,
      input.unit || "dona",
      Math.round(input.buy_price || 0),
      Math.round(input.sell_price || 0),
      Number(input.stock || 0),
      Number(input.min_stock || 0),
      input.expiry_date || null,
      input.image_url?.trim() || null,
      new Date().toISOString(),
    );
  return getProduct(Number(info.lastInsertRowid));
}

export function getProduct(id: number) {
  const p = row<Product>(
    getDb()
      .prepare(
        `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?`,
      )
      .get(id),
  );
  if (!p) throw new Error("Mahsulot topilmadi");
  return p;
}

export function updateProduct(id: number, patch: Partial<Product> & { active?: boolean | number }) {
  const current = getProduct(id);
  getDb()
    .prepare(
      `UPDATE products SET barcode=?, name=?, category_id=?, unit=?, buy_price=?, sell_price=?, stock=?, min_stock=?, expiry_date=?, image_url=?, active=? WHERE id=?`,
    )
    .run(
      patch.barcode ?? current.barcode,
      (patch.name ?? current.name).trim(),
      patch.category_id ?? current.category_id,
      patch.unit ?? current.unit,
      Math.round(Number(patch.buy_price ?? current.buy_price)),
      Math.round(Number(patch.sell_price ?? current.sell_price)),
      Number(patch.stock ?? current.stock),
      Number(patch.min_stock ?? current.min_stock),
      patch.expiry_date !== undefined ? patch.expiry_date : current.expiry_date,
      patch.image_url !== undefined ? patch.image_url : current.image_url,
      patch.active === undefined ? current.active : patch.active ? 1 : 0,
      id,
    );
  return getProduct(id);
}

export type Party = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  debt?: number;
  payable?: number;
  note: string | null;
  created_at: string;
};

export function listCustomers(q?: string) {
  const like = q?.trim() ? `%${q.trim()}%` : null;
  const sql = like
    ? "SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name"
    : "SELECT * FROM customers ORDER BY name";
  return rows<Party>(like ? getDb().prepare(sql).all(like, like) : getDb().prepare(sql).all());
}

export function createCustomer(input: { name: string; phone?: string; address?: string; note?: string }) {
  if (!input.name.trim()) throw new Error("Mijoz nomi kerak");
  const info = getDb()
    .prepare("INSERT INTO customers (name, phone, address, debt, note, created_at) VALUES (?, ?, ?, 0, ?, ?)")
    .run(input.name.trim(), input.phone?.trim() || null, input.address?.trim() || null, input.note?.trim() || null, new Date().toISOString());
  return row<Party>(getDb().prepare("SELECT * FROM customers WHERE id = ?").get(Number(info.lastInsertRowid)));
}

export function updateCustomer(id: number, patch: { name?: string; phone?: string; address?: string; note?: string }) {
  const c = row<Party>(getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id));
  if (!c) throw new Error("Mijoz topilmadi");
  getDb()
    .prepare("UPDATE customers SET name=?, phone=?, address=?, note=? WHERE id=?")
    .run(patch.name?.trim() || c.name, patch.phone ?? c.phone, patch.address ?? c.address, patch.note ?? c.note, id);
  return row<Party>(getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id));
}

export function listSuppliers(q?: string) {
  const like = q?.trim() ? `%${q.trim()}%` : null;
  const sql = like
    ? "SELECT * FROM suppliers WHERE name LIKE ? OR phone LIKE ? ORDER BY name"
    : "SELECT * FROM suppliers ORDER BY name";
  return rows<Party>(like ? getDb().prepare(sql).all(like, like) : getDb().prepare(sql).all());
}

export function createSupplier(input: { name: string; phone?: string; address?: string; note?: string }) {
  if (!input.name.trim()) throw new Error("Ta'minotchi nomi kerak");
  const info = getDb()
    .prepare("INSERT INTO suppliers (name, phone, address, payable, note, created_at) VALUES (?, ?, ?, 0, ?, ?)")
    .run(input.name.trim(), input.phone?.trim() || null, input.address?.trim() || null, input.note?.trim() || null, new Date().toISOString());
  return row<Party>(getDb().prepare("SELECT * FROM suppliers WHERE id = ?").get(Number(info.lastInsertRowid)));
}

export function updateSupplier(id: number, patch: { name?: string; phone?: string; address?: string; note?: string }) {
  const c = row<Party>(getDb().prepare("SELECT * FROM suppliers WHERE id = ?").get(id));
  if (!c) throw new Error("Ta'minotchi topilmadi");
  getDb()
    .prepare("UPDATE suppliers SET name=?, phone=?, address=?, note=? WHERE id=?")
    .run(patch.name?.trim() || c.name, patch.phone ?? c.phone, patch.address ?? c.address, patch.note ?? c.note, id);
  return row<Party>(getDb().prepare("SELECT * FROM suppliers WHERE id = ?").get(id));
}

// A line without product_id is a free-amount sale ("Boshqa mahsulot"): no stock, the cashier sets the price.
export type CartItem = { product_id?: number | null; qty: number; discount?: number; price?: number; name?: string };

type SaleLineProduct = Pick<Product, "name" | "unit" | "buy_price" | "sell_price"> & { id: number | null };

function freeLineProduct(item: CartItem): SaleLineProduct {
  const price = Math.round(Number(item.price));
  if (!Number.isFinite(price) || price <= 0) throw new Error("Erkin summa noto'g'ri");
  const name = String(item.name || "").trim().slice(0, 80) || "Boshqa mahsulot";
  return { id: null, name, unit: "dona", buy_price: 0, sell_price: price };
}

export function createSale(input: {
  userId: number;
  customerId?: number | null;
  paymentMethod: string;
  discount?: number;
  paid?: number;
  foreignPaid?: number;
  note?: string;
  items: CartItem[];
  clientId?: string | null;
  soldAt?: string | null;
}) {
  if (!input.items?.length) throw new Error("Savatcha bo'sh");
  const db = getDb();
  assertLicensed();
  const clientId = input.clientId ? String(input.clientId).slice(0, 64) : null;
  if (clientId) {
    const existing = db.prepare("SELECT id FROM sales WHERE client_id = ?").get(clientId) as { id: number } | undefined;
    if (existing) return getSale(existing.id);
  }
  const settings = getSettings();
  // An offline sale already happened at the counter: the goods and money changed hands, so it must not be rejected.
  const soldAtMs = input.soldAt ? Date.parse(input.soldAt) : NaN;
  const offline = Number.isFinite(soldAtMs) && soldAtMs <= Date.now() && soldAtMs > Date.now() - 30 * 86400000;
  const allowNeg = settings.allow_negative_stock === "1" || offline;
  const usdRate = Number(settings.usd_rate || 12500);

  db.exec("BEGIN");
  try {
    const ruleDiscounts = previewDiscounts(
      input.items
        .filter((item) => item.product_id)
        .map((item) => ({ product_id: Number(item.product_id), qty: Number(item.qty) })),
    ).itemDiscounts;
    const used = new Map<number, number>();
    const lines = input.items.map((item) => {
      const qty = Number(item.qty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Miqdor noto'g'ri");
      if (!item.product_id) {
        const p = freeLineProduct(item);
        const total = Math.round(qty * p.sell_price);
        return { p, qty, discount: 0, total };
      }
      const product = getProduct(Number(item.product_id));
      if (!product.active && !offline) throw new Error(`${product.name}: sotuvdan olingan`);
      if (!allowNeg && product.stock + 1e-9 < qty) {
        throw new Error(`${product.name}: omborda yetarli emas (${product.stock} ${product.unit})`);
      }
      const p: SaleLineProduct = product;
      const gross = Math.round(qty * p.sell_price);
      const left = Math.max(0, (ruleDiscounts[product.id] || 0) - (used.get(product.id) || 0));
      const discount = Math.min(gross, left);
      used.set(product.id, (used.get(product.id) || 0) + discount);
      return { p, qty, discount, total: gross - discount };
    });
    const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.p.sell_price), 0);
    const afterItems = lines.reduce((s, l) => s + l.total, 0);
    const requested = Math.round(Number(input.discount) || 0);
    if (requested < 0) throw new Error("Chegirma noto'g'ri");
    const discount = Math.min(requested, afterItems);
    const total = afterItems - discount;
    const method = input.paymentMethod;
    if (method === "qarz" && !input.customerId) throw new Error("Qarzga sotish uchun mijoz tanlang");
    if (method === "usd" && settings.usd_enabled !== "1") throw new Error("USD to'lovi o'chirilgan");

    let currency = "UZS";
    let foreignRate: number | null = null;
    let foreignPaid: number | null = null;
    let paid: number;
    let change: number;

    if (method === "usd") {
      currency = "USD";
      foreignRate = usdRate;
      foreignPaid = Math.round((Number(input.foreignPaid ?? input.paid ?? 0) + Number.EPSILON) * 100) / 100;
      paid = Math.round(foreignPaid * usdRate);
      if (paid + 1 < total) throw new Error("USD to'lov yetarli emas");
      change = Math.max(0, paid - total);
    } else {
      paid = method === "qarz" ? Math.round(Number(input.paid) || 0) : Math.round(Number(input.paid ?? total));
      if (!Number.isFinite(paid) || paid < 0) throw new Error("To'lov summasi noto'g'ri");
      if (method !== "qarz" && paid < total) throw new Error("To'lov summasi yetarli emas");
      if (method === "qarz" && paid > total) throw new Error("Qarzga sotishda to'lov summadan oshmasin");
      change = method === "naqd" ? Math.max(0, paid - total) : 0;
    }

    const debt = method === "qarz" ? total - paid : 0;

    const soldAt = offline ? new Date(soldAtMs) : new Date();
    const day = tashkentDate(soldAt).replace(/-/g, "");
    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM sales WHERE number LIKE ?").get(`S-${day}-%`) as { c: number }
    ).c;
    const number = `S-${day}-${String(count + 1).padStart(4, "0")}`;
    const created = soldAt.toISOString();
    const branchId = getCurrentBranchId();
    const info = db
      .prepare(
        `INSERT INTO sales (number, user_id, customer_id, payment_method, subtotal, discount, total, paid, change_amount, debt_amount, note, created_at, currency, foreign_rate, foreign_paid, branch_id, client_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        number,
        input.userId,
        input.customerId || null,
        method,
        subtotal,
        discount,
        total,
        paid,
        change,
        debt,
        input.note || null,
        created,
        currency,
        foreignRate,
        foreignPaid,
        branchId,
        clientId,
      );
    const saleId = Number(info.lastInsertRowid);
    const itemStmt = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, name, unit, qty, buy_price, sell_price, discount, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const stockStmt = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
    for (const line of lines) {
      itemStmt.run(
        saleId,
        line.p.id,
        line.p.name,
        line.p.unit,
        line.qty,
        line.p.buy_price,
        line.p.sell_price,
        line.discount,
        line.total,
      );
      if (line.p.id !== null) stockStmt.run(line.qty, line.p.id);
    }
    if (debt > 0 && input.customerId) {
      db.prepare("UPDATE customers SET debt = debt + ? WHERE id = ?").run(debt, input.customerId);
    }
    db.exec("COMMIT");
    linkSaleToShift(saleId, input.userId);
    if (settings.fiscal_enabled === "1") {
      try {
        buildFiscalQr(saleId);
      } catch {
        /* fiskal ixtiyoriy */
      }
    }
    return getSale(saleId);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getSale(id: number) {
  const sale = row<SqlRow>(
    getDb()
      .prepare(
        `SELECT s.*, u.name AS cashier_name, c.name AS customer_name
         FROM sales s JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = ?`,
      )
      .get(id),
  );
  if (!sale) throw new Error("Savdo topilmadi");
  const items = getDb().prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(id);
  return { ...sale, items };
}

export function listSales(from?: string, to?: string) {
  const { start, end } = periodRange(from, to);
  return rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT s.*, u.name AS cashier_name, c.name AS customer_name
         FROM sales s JOIN users u ON u.id = s.user_id
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.created_at >= ? AND s.created_at < ?
         ORDER BY s.created_at DESC`,
      )
      .all(start, end),
  );
}

export function createStockIn(input: {
  userId: number;
  supplierId?: number | null;
  paid?: number;
  note?: string;
  items: Array<{ product_id: number; qty: number; buy_price?: number; sell_price?: number; expiry_date?: string | null }>;
}) {
  if (!input.items?.length) throw new Error("Mahsulot tanlang");
  const db = getDb();
  db.exec("BEGIN");
  try {
    const lines = input.items.map((item) => {
      const p = getProduct(item.product_id);
      if (!Number.isFinite(item.qty) || item.qty <= 0) throw new Error("Miqdor noto'g'ri");
      const buy = Math.round(item.buy_price ?? p.buy_price);
      const sell = Math.round(item.sell_price ?? p.sell_price);
      if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy < 0 || sell < 0) throw new Error("Narx noto'g'ri");
      return { p, qty: item.qty, buy, sell, total: Math.round(item.qty * buy), expiry_date: item.expiry_date || null };
    });
    const total = lines.reduce((s, l) => s + l.total, 0);
    const paid = Math.round(input.paid || 0);
    if (!Number.isFinite(paid) || paid < 0) throw new Error("To'lov summasi noto'g'ri");
    if (paid > total) throw new Error("To'lov summadan oshmasin");
    const day = tashkentDate().replace(/-/g, "");
    const count = (
      db.prepare("SELECT COUNT(*) AS c FROM stock_ins WHERE number LIKE ?").get(`K-${day}-%`) as { c: number }
    ).c;
    const number = `K-${day}-${String(count + 1).padStart(4, "0")}`;
    const info = db
      .prepare(
        `INSERT INTO stock_ins (number, supplier_id, user_id, total, paid, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(number, input.supplierId || null, input.userId, total, paid, input.note || null, new Date().toISOString());
    const id = Number(info.lastInsertRowid);
    const itemStmt = db.prepare(
      `INSERT INTO stock_in_items (stock_in_id, product_id, name, qty, buy_price, sell_price, expiry_date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const upd = db.prepare("UPDATE products SET stock = stock + ?, buy_price = ?, sell_price = ? WHERE id = ?");
    const updExpiry = db.prepare("UPDATE products SET expiry_date = ? WHERE id = ? AND (expiry_date IS NULL OR expiry_date > ?)");
    for (const line of lines) {
      itemStmt.run(id, line.p.id, line.p.name, line.qty, line.buy, line.sell, line.expiry_date);
      upd.run(line.qty, line.buy, line.sell, line.p.id);
      if (line.expiry_date) updExpiry.run(line.expiry_date, line.p.id, line.expiry_date);
    }
    if (input.supplierId && total - paid > 0) {
      db.prepare("UPDATE suppliers SET payable = payable + ? WHERE id = ?").run(total - paid, input.supplierId);
    }
    db.exec("COMMIT");
    return listStockIns();
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function listStockIns() {
  return rows<SqlRow>(
    getDb()
      .prepare(
        `SELECT s.*, u.name AS user_name, sp.name AS supplier_name
         FROM stock_ins s JOIN users u ON u.id = s.user_id
         LEFT JOIN suppliers sp ON sp.id = s.supplier_id
         ORDER BY s.created_at DESC LIMIT 100`,
      )
      .all(),
  );
}

export function addPayment(input: {
  userId: number;
  kind: "customer" | "supplier" | "expense" | "income" | "cash_in" | "cash_out";
  amount: number;
  method?: string;
  category?: string;
  note?: string;
  partyId?: number | null;
}) {
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Summa noto'g'ri");
  const db = getDb();
  let partyName: string | null = null;
  db.exec("BEGIN");
  try {
    if (input.kind === "customer") {
      if (!input.partyId) throw new Error("Mijoz tanlang");
      const c = row<Party>(db.prepare("SELECT * FROM customers WHERE id = ?").get(input.partyId));
      if (!c) throw new Error("Mijoz topilmadi");
      if (amount > (c.debt || 0)) throw new Error("Qarzdan ko'p to'lov kiritildi");
      db.prepare("UPDATE customers SET debt = debt - ? WHERE id = ?").run(amount, input.partyId);
      partyName = c.name;
    }
    if (input.kind === "supplier") {
      if (!input.partyId) throw new Error("Ta'minotchi tanlang");
      const s = row<Party>(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(input.partyId));
      if (!s) throw new Error("Ta'minotchi topilmadi");
      if (amount > (s.payable || 0)) throw new Error("Qarzdan ko'p to'lov kiritildi");
      db.prepare("UPDATE suppliers SET payable = payable - ? WHERE id = ?").run(amount, input.partyId);
      partyName = s.name;
    }
    db.prepare(
      `INSERT INTO payments (kind, party_id, party_name, amount, method, category, note, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.kind,
      input.partyId || null,
      partyName,
      amount,
      input.method || "naqd",
      input.category || null,
      input.note || null,
      input.userId,
      new Date().toISOString(),
    );
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function listPayments(kind?: string, from?: string, to?: string) {
  const { start, end } = periodRange(from, to);
  let sql = `SELECT p.*, u.name AS user_name FROM payments p JOIN users u ON u.id = p.user_id
             WHERE p.created_at >= ? AND p.created_at < ?`;
  const params: unknown[] = [start, end];
  if (kind) {
    sql += " AND p.kind = ?";
    params.push(kind);
  }
  sql += " ORDER BY p.created_at DESC";
  return rows<SqlRow>(getDb().prepare(sql).all(...params));
}

function cashDelta() {
  const db = getDb();
  const sum = (sql: string) => (db.prepare(sql).get() as { s: number }).s;
  const sales = sum("SELECT COALESCE(SUM(paid - change_amount),0) AS s FROM sales WHERE payment_method = 'naqd'");
  const debtDownPayments = sum("SELECT COALESCE(SUM(paid),0) AS s FROM sales WHERE payment_method = 'qarz'");
  const deliveries = sum("SELECT COALESCE(SUM(total),0) AS s FROM delivery_orders WHERE status = 'done' AND payment_method = 'naqd'");
  const customer = sum("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE kind = 'customer' AND method = 'naqd'");
  const income = sum("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE kind IN ('income','cash_in') AND method = 'naqd'");
  const expense = sum("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE kind IN ('expense','cash_out','supplier') AND method = 'naqd'");
  const refunds = sum("SELECT COALESCE(SUM(total),0) AS s FROM sale_returns WHERE refund_method = 'naqd'");
  const stockInPaid = sum("SELECT COALESCE(SUM(paid),0) AS s FROM stock_ins");
  const opening = Number(getSettings().opening_cash || 0);
  return opening + sales + debtDownPayments + deliveries + customer + income - expense - refunds - stockInPaid;
}

export function getDashboard() {
  const today = dayRange();
  const db = getDb();
  const report = getReports(today.day, today.day);
  const debts = db.prepare("SELECT COALESCE(SUM(debt),0) AS s FROM customers").get() as { s: number };
  const payables = db.prepare("SELECT COALESCE(SUM(payable),0) AS s FROM suppliers").get() as { s: number };
  const lowStock = rows<Product>(
    db
      .prepare(
        `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.active = 1 AND p.min_stock > 0 AND p.stock <= p.min_stock ORDER BY p.stock ASC LIMIT 8`,
      )
      .all(),
  );
  const recent = listSales(today.day, today.day).slice(0, 8);
  const expiring = listExpiringProducts();
  const chart = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const range = dayRange(tashkentDate(d));
    const rowv = db
      .prepare("SELECT COALESCE(SUM(total),0) AS t FROM sales WHERE created_at >= ? AND created_at < ?")
      .get(range.start, range.end) as { t: number };
    chart.push({ day: range.day.slice(5), total: rowv.t });
  }
  const methods = rows<{ payment_method: string; t: number }>(
    db
      .prepare(
        `SELECT payment_method, COALESCE(SUM(total),0) AS t FROM sales
         WHERE created_at >= ? AND created_at < ? GROUP BY payment_method`,
      )
      .all(today.start, today.end),
  );
  return {
    today: {
      sales: report.revenue,
      count: report.count,
      profit: report.gross,
      expenses: report.expenses,
      net: report.net,
    },
    cash: report.cash,
    debts: debts.s,
    payables: payables.s,
    lowStock,
    expiring: expiring.slice(0, 8),
    recent,
    chart,
    methods,
    settings: { store_name: getSettings().store_name || "" },
  };
}

export function getReports(from?: string, to?: string) {
  const range = periodRange(from, to);
  const db = getDb();
  const sales = db
    .prepare("SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sales WHERE created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { t: number; c: number };
  const cogs = db
    .prepare(
      `SELECT COALESCE(SUM(si.buy_price * si.qty),0) AS s
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= ? AND s.created_at < ?`,
    )
    .get(range.start, range.end) as { s: number };
  const expenses = db
    .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE kind = 'expense' AND created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { s: number };
  const income = db
    .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE kind = 'income' AND created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { s: number };
  const deliveries = db
    .prepare(
      `SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM delivery_orders
       WHERE status = 'done' AND delivered_at >= ? AND delivered_at < ?`,
    )
    .get(range.start, range.end) as { t: number; c: number };
  // Delivery items don't store a purchase price, so the current one is used.
  const deliveryCogs = db
    .prepare(
      `SELECT COALESCE(SUM(di.qty * COALESCE(p.buy_price, 0)),0) AS s
       FROM delivery_order_items di JOIN delivery_orders d ON d.id = di.order_id
       LEFT JOIN products p ON p.id = di.product_id
       WHERE d.status = 'done' AND d.delivered_at >= ? AND d.delivered_at < ?`,
    )
    .get(range.start, range.end) as { s: number };
  const returns = db
    .prepare("SELECT COALESCE(SUM(total),0) AS t, COUNT(*) AS c FROM sale_returns WHERE created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { t: number; c: number };
  const returnsCogs = db
    .prepare(
      `SELECT COALESCE(SUM(ri.qty * COALESCE(si.buy_price, 0)),0) AS s
       FROM sale_return_items ri JOIN sale_returns r ON r.id = ri.return_id
       LEFT JOIN sale_items si ON si.id = ri.sale_item_id
       WHERE r.created_at >= ? AND r.created_at < ?`,
    )
    .get(range.start, range.end) as { s: number };
  const waste = db
    .prepare("SELECT COALESCE(SUM(loss_amount),0) AS s FROM waste_records WHERE created_at >= ? AND created_at < ?")
    .get(range.start, range.end) as { s: number };
  const revenue = sales.t + deliveries.t - returns.t;
  const totalCogs = Math.round(cogs.s + deliveryCogs.s - returnsCogs.s);
  const gross = revenue - totalCogs;
  const net = gross - expenses.s + income.s - waste.s;
  const byProduct = rows<{
    product_id: number;
    name: string;
    qty: number;
    revenue: number;
    profit: number;
  }>(
    db
      .prepare(
        `SELECT si.product_id, si.name, SUM(si.qty) AS qty, SUM(si.total) AS revenue,
                SUM(si.total - si.buy_price * si.qty) AS profit
         FROM sale_items si JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= ? AND s.created_at < ?
         GROUP BY si.product_id, si.name ORDER BY revenue DESC`,
      )
      .all(range.start, range.end),
  );
  let cumulative = 0;
  const abc = byProduct.map((p) => {
    cumulative += p.revenue;
    const share = sales.t ? cumulative / sales.t : 0;
    const cls = share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C";
    return { ...p, share, class: cls };
  });
  const byCashier = rows<{ name: string; t: number; c: number }>(
    db
      .prepare(
        `SELECT u.name, SUM(s.total) AS t, COUNT(*) AS c FROM sales s JOIN users u ON u.id = s.user_id
         WHERE s.created_at >= ? AND s.created_at < ? GROUP BY u.id, u.name ORDER BY t DESC`,
      )
      .all(range.start, range.end),
  );
  const byMethod = rows<{ payment_method: string; t: number; c: number }>(
    db
      .prepare(
        `SELECT payment_method, SUM(total) AS t, COUNT(*) AS c FROM sales
         WHERE created_at >= ? AND created_at < ? GROUP BY payment_method`,
      )
      .all(range.start, range.end),
  );
  const expenseRows = rows<{ category: string; s: number }>(
    db
      .prepare(
        `SELECT COALESCE(category, 'Boshqa') AS category, SUM(amount) AS s FROM payments
         WHERE kind = 'expense' AND created_at >= ? AND created_at < ?
         GROUP BY category ORDER BY s DESC`,
      )
      .all(range.start, range.end),
  );
  return {
    from: range.startDay,
    to: range.endDay,
    sales: sales.t,
    count: sales.c,
    deliveries: deliveries.t,
    deliveryCount: deliveries.c,
    returns: returns.t,
    returnCount: returns.c,
    waste: waste.s,
    revenue,
    cogs: totalCogs,
    gross,
    expenses: expenses.s,
    income: income.s,
    net,
    abc,
    byCashier,
    byMethod,
    expenseRows,
    cash: cashDelta(),
    debts: (db.prepare("SELECT COALESCE(SUM(debt),0) AS s FROM customers").get() as { s: number }).s,
    payables: (db.prepare("SELECT COALESCE(SUM(payable),0) AS s FROM suppliers").get() as { s: number }).s,
  };
}

export function exportBackup() {
  const db = getDb();
  const tables = [
    "users",
    "settings",
    "categories",
    "products",
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
  const data: Record<string, SqlRow[]> = {};
  for (const t of tables) data[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return {
    app: "hisob",
    exportedAt: new Date().toISOString(),
    checksum: createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 12),
    data,
  };
}
