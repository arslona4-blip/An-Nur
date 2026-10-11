import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { PAYMENT_METHODS } from "./format";
import { assertLicensed } from "./license";
import { createDeliveryOrder, getDeliveryOrder, updateDeliveryStatus } from "./phase3";

// The delivery bot shares this shop's single warehouse: it reads the catalogue from here and sends its orders here.

export function requireBotKey(req: Request) {
  requireKey(req, process.env.ANNUR_BOT_KEY);
}

// The owner's desktop assistant gets its own key: it may read reports but never place orders.
export function requireAgentKey(req: Request) {
  requireKey(req, process.env.ANNUR_AGENT_KEY);
}

function requireKey(req: Request, secret: string | undefined) {
  const expected = secret?.trim() || "";
  const auth = req.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!expected || !given || !timingSafeEqual(hash(given), hash(expected))) {
    const err = new Error("Ruxsat yo‘q");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
}

let migrated = false;
function migrate() {
  if (migrated) return;
  const db = getDb();
  const cols = (db.prepare("PRAGMA table_info(delivery_orders)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("external_ref")) db.exec("ALTER TABLE delivery_orders ADD COLUMN external_ref TEXT");
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_external_ref ON delivery_orders(external_ref) WHERE external_ref IS NOT NULL",
  );
  migrated = true;
}

export function catalog() {
  const db = getDb();
  const live = db.prepare("SELECT value FROM settings WHERE key = 'store_live'").get() as { value: string } | undefined;
  const products = db
    .prepare(
      `SELECT p.id, p.name, p.barcode, p.unit, p.sell_price AS price, p.stock, p.active, c.name AS category
       FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.id`,
    )
    .all();
  // Until the owner clears the demo catalogue, the bot must not mirror it over its real products.
  return { live: live?.value === "1", products, at: new Date().toISOString() };
}

const SNAPSHOT_DAYS = 400;

// Only the columns the assistant's reports read; no users, tokens or other settings ever leave the shop.
export function agentSnapshot() {
  const db = getDb();
  const since = new Date(Date.now() - SNAPSHOT_DAYS * 86400000).toISOString();
  const all = (sql: string, ...params: string[]) => db.prepare(sql).all(...params);
  return {
    at: new Date().toISOString(),
    tables: {
      sales: all(
        "SELECT id, created_at, total, discount, debt_amount, payment_method FROM sales WHERE created_at >= ?",
        since,
      ),
      sale_items: all(
        `SELECT si.id, si.sale_id, si.product_id, si.name, si.unit, si.qty, si.total, si.buy_price
         FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.created_at >= ?`,
        since,
      ),
      sale_returns: all("SELECT id, created_at, total FROM sale_returns WHERE created_at >= ?", since),
      sale_return_items: all(
        `SELECT ri.return_id, ri.sale_item_id, ri.qty FROM sale_return_items ri
         JOIN sale_returns r ON r.id = ri.return_id WHERE r.created_at >= ?`,
        since,
      ),
      payments: all(
        "SELECT kind, amount, created_at FROM payments WHERE kind = 'expense' AND created_at >= ?",
        since,
      ),
      shifts: all("SELECT id, status FROM shifts WHERE status = 'open'"),
      products: all(
        "SELECT name, unit, stock, min_stock, sell_price, buy_price, expiry_date, active FROM products",
      ),
      settings: all("SELECT key, value FROM settings WHERE key = 'expiry_alert_days'"),
      customers: all("SELECT name, phone, debt FROM customers WHERE debt > 0"),
      suppliers: all("SELECT name, payable FROM suppliers WHERE payable > 0"),
    },
  };
}

type BotOrder = {
  external_ref: string;
  customer_name: string;
  phone: string;
  address: string;
  delivery_fee?: number;
  note?: string;
  items: Array<{ product_id: number; qty: number; price?: number }>;
};

function findByRef(ref: string) {
  return getDb().prepare("SELECT id FROM delivery_orders WHERE external_ref = ?").get(ref) as { id: number } | undefined;
}

function botUserId() {
  const admin = getDb()
    .prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!admin) throw new Error("Faol admin topilmadi");
  return admin.id;
}

export function receiveOrder(body: BotOrder) {
  migrate();
  const ref = String(body?.external_ref || "").trim().slice(0, 64);
  if (!ref) throw new Error("external_ref kerak");
  const existing = findByRef(ref);
  if (existing) return getDeliveryOrder(existing.id);
  assertLicensed();
  // The customer has already been promised these goods in the bot, so a short count must not drop the order.
  const order = createDeliveryOrder({
    userId: botUserId(),
    customerName: String(body.customer_name || "Bot mijozi").slice(0, 120),
    phone: String(body.phone || "—").slice(0, 40),
    address: String(body.address || "—").slice(0, 300),
    deliveryFee: Number(body.delivery_fee) || 0,
    note: body.note ? String(body.note).slice(0, 500) : "Telegram bot",
    items: (body.items || []).map((i) => ({
      product_id: Number(i.product_id),
      qty: Number(i.qty),
      price: i.price === undefined ? undefined : Number(i.price),
    })),
    allowNegative: true,
    externalRef: ref,
  }) as unknown as { id: number };
  return getDeliveryOrder(order.id);
}

const PAYMENT = new Set<string>(PAYMENT_METHODS.map((m) => m.id));

export function receiveStatus(body: { external_ref: string; status: string; payment_method?: string }) {
  migrate();
  const found = findByRef(String(body?.external_ref || "").trim());
  if (!found) {
    const err = new Error("Buyurtma topilmadi");
    (err as Error & { status: number }).status = 404;
    throw err;
  }
  const order = getDeliveryOrder(found.id) as unknown as { status: string };
  if (order.status === body.status || order.status === "done" || order.status === "cancelled") {
    return getDeliveryOrder(found.id);
  }
  const pm = PAYMENT.has(String(body.payment_method)) ? String(body.payment_method) : "naqd";
  return updateDeliveryStatus(found.id, body.status, body.status === "done" ? pm : undefined);
}
