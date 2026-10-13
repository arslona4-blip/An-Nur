import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import QRCode from "qrcode";
import { getDb, getProduct, getSettings } from "./db";
import { STORE_BARCODE_PREFIX, storeBarcode } from "./ean13";

type SqlRow = Record<string, unknown>;

export function migratePhase7(db: DatabaseSync) {
  const has = (db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('sales') WHERE name = 'public_token'").get() as { c: number }).c;
  if (!has) db.exec("ALTER TABLE sales ADD COLUMN public_token TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_public_token ON sales(public_token) WHERE public_token IS NOT NULL");
}

export function nextStoreBarcode() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(barcode, 3, 10) AS INTEGER)) AS m FROM products
       WHERE LENGTH(barcode) = 13 AND barcode LIKE ? AND barcode NOT GLOB '*[^0-9]*'`,
    )
    .get(`${STORE_BARCODE_PREFIX}%`) as { m: number | null };
  let seq = Number(row.m || 0) + 1;
  const taken = db.prepare("SELECT 1 FROM products WHERE barcode = ?");
  while (taken.get(storeBarcode(seq))) seq++;
  return storeBarcode(seq);
}

export function assignBarcode(productId: number) {
  const p = getProduct(productId);
  if (p.barcode?.trim()) throw new Error(`${p.name}: shtrix-kodi bor (${p.barcode})`);
  const code = nextStoreBarcode();
  getDb().prepare("UPDATE products SET barcode = ? WHERE id = ?").run(code, productId);
  return code;
}

export function assignMissingBarcodes() {
  const db = getDb();
  const ids = (
    db.prepare("SELECT id FROM products WHERE active = 1 AND (barcode IS NULL OR TRIM(barcode) = '') ORDER BY name").all() as SqlRow[]
  ).map((r) => Number(r.id));
  db.exec("BEGIN");
  try {
    for (const id of ids) db.prepare("UPDATE products SET barcode = ? WHERE id = ?").run(nextStoreBarcode(), id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return ids.length;
}

export function receiptToken(saleId: number) {
  const db = getDb();
  const sale = db.prepare("SELECT id, public_token FROM sales WHERE id = ?").get(saleId) as SqlRow | undefined;
  if (!sale) throw new Error("Savdo topilmadi");
  if (sale.public_token) return String(sale.public_token);
  const token = randomBytes(16).toString("base64url");
  db.prepare("UPDATE sales SET public_token = ? WHERE id = ? AND public_token IS NULL").run(token, saleId);
  return String((db.prepare("SELECT public_token FROM sales WHERE id = ?").get(saleId) as SqlRow).public_token);
}

export async function receiptLink(saleId: number, origin: string) {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    throw new Error("Manzil noto'g'ri");
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("Manzil noto'g'ri");
  const url = `${base.origin}/chek/${receiptToken(saleId)}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { url, svg };
}

export type PublicReceipt = {
  number: string;
  created_at: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  change_amount: number;
  debt_amount: number;
  cashier: string;
  items: Array<{ name: string; unit: string; qty: number; sell_price: number; discount: number; total: number }>;
  store: { name: string; address: string; phone: string; footer: string };
};

export function publicReceipt(token: string): PublicReceipt | null {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const db = getDb();
  const sale = db
    .prepare(
      `SELECT s.id, s.number, s.created_at, s.payment_method, s.subtotal, s.discount, s.total, s.paid,
              s.change_amount, s.debt_amount, u.name AS cashier
       FROM sales s JOIN users u ON u.id = s.user_id WHERE s.public_token = ?`,
    )
    .get(token) as SqlRow | undefined;
  if (!sale) return null;
  const items = db
    .prepare("SELECT name, unit, qty, sell_price, discount, total FROM sale_items WHERE sale_id = ? ORDER BY id")
    .all(Number(sale.id)) as PublicReceipt["items"];
  const s = getSettings();
  return {
    number: String(sale.number),
    created_at: String(sale.created_at),
    payment_method: String(sale.payment_method),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    total: Number(sale.total),
    paid: Number(sale.paid),
    change_amount: Number(sale.change_amount),
    debt_amount: Number(sale.debt_amount),
    cashier: String(sale.cashier),
    items,
    store: {
      name: s.store_name || "Do'kon",
      address: s.store_address || "",
      phone: s.store_phone || "",
      footer: s.receipt_footer || "",
    },
  };
}

export function listProductsByIds(ids: number[]) {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 500);
  if (!clean.length) return [];
  const rows = getDb()
    .prepare(
      `SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.active = 1 AND p.id IN (${clean.map(() => "?").join(",")})`,
    )
    .all(...clean) as SqlRow[];
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return clean.map((id) => byId.get(id)).filter(Boolean);
}
