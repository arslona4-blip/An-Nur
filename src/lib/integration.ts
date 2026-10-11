import { createHash, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { PAYMENT_METHODS } from "./format";
import { assertLicensed } from "./license";
import { createDeliveryOrder, getDeliveryOrder, updateDeliveryStatus } from "./phase3";

// The delivery bot shares this shop's single warehouse: it reads the catalogue from here and sends its orders here.

export function requireBotKey(req: Request) {
  const expected = process.env.ANNUR_BOT_KEY?.trim() || "";
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
