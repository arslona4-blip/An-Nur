import { DatabaseSync } from "node:sqlite";
import net from "node:net";
import { getDb, getProduct, getSale, getSettings } from "./db";
import { methodLabel, som, tashkentDate, tashkentDateTime } from "./format";

type SqlRow = Record<string, unknown>;

const PHASE3 = "phase3-v1";

function row<T>(r: SqlRow | undefined) {
  return r as T | null;
}

function rows<T>(list: SqlRow[]) {
  return list as T[];
}

export const DELIVERY_STATUSES = [
  { id: "new", label: "Yangi" },
  { id: "preparing", label: "Tayyorlanmoqda" },
  { id: "delivering", label: "Yo'lda" },
  { id: "done", label: "Yetkazildi" },
  { id: "cancelled", label: "Bekor" },
] as const;

export function migratePhase3(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS delivery_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT UNIQUE NOT NULL,
      sale_id INTEGER REFERENCES sales(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      customer_id INTEGER REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'preparing', 'delivering', 'done', 'cancelled')),
      subtotal INTEGER NOT NULL DEFAULT 0,
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      delivered_at TEXT
    );
    CREATE TABLE IF NOT EXISTS delivery_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      qty REAL NOT NULL,
      sell_price INTEGER NOT NULL,
      total INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_delivery_status ON delivery_orders(status);
    CREATE INDEX IF NOT EXISTS idx_delivery_created ON delivery_orders(created_at);
  `);

  const saleCols = [
    ["currency", "TEXT DEFAULT 'UZS'"],
    ["foreign_rate", "INTEGER"],
    ["foreign_paid", "REAL"],
  ] as const;
  for (const [col, def] of saleCols) {
    const has = (
      db.prepare(`SELECT COUNT(*) AS c FROM pragma_table_info('sales') WHERE name = ?`).get(col) as { c: number }
    ).c;
    if (!has) db.exec(`ALTER TABLE sales ADD COLUMN ${col} ${def}`);
  }

  const defaults: Record<string, string> = {
    usd_enabled: "0",
    usd_rate: "12500",
    printer_width: "58",
    printer_ip: "",
    printer_port: "9100",
    scale_enabled: "1",
  };
  const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING");
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  const ver = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (ver?.value === PHASE3) return;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "schema_version",
    PHASE3,
  );
}

export function usdRate() {
  return Number(getSettings().usd_rate || 12500);
}

export function usdFromSom(amount: number) {
  const rate = usdRate();
  if (!rate) return 0;
  return Math.round((amount / rate) * 100) / 100;
}

export function somFromUsd(amount: number) {
  return Math.round(amount * usdRate());
}

export function listDeliveryOrders(status?: string) {
  const db = getDb();
  if (status) {
    return rows<SqlRow>(
      db
        .prepare(
          `SELECT d.*, u.name AS user_name FROM delivery_orders d JOIN users u ON u.id = d.user_id
           WHERE d.status = ? ORDER BY d.created_at DESC LIMIT 100`,
        )
        .all(status),
    );
  }
  return rows<SqlRow>(
    db
      .prepare(
        `SELECT d.*, u.name AS user_name FROM delivery_orders d JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC LIMIT 100`,
      )
      .all(),
  );
}

export function getDeliveryOrder(id: number) {
  const d = row<SqlRow>(
    getDb()
      .prepare(
        `SELECT d.*, u.name AS user_name FROM delivery_orders d JOIN users u ON u.id = d.user_id WHERE d.id = ?`,
      )
      .get(id),
  );
  if (!d) throw new Error("Buyurtma topilmadi");
  const items = getDb().prepare("SELECT * FROM delivery_order_items WHERE order_id = ?").all(id);
  return { ...d, items };
}

export function createDeliveryOrder(input: {
  userId: number;
  customerId?: number | null;
  customerName: string;
  phone: string;
  address: string;
  deliveryFee?: number;
  note?: string;
  items: Array<{ product_id: number; qty: number }>;
}) {
  if (!input.items?.length) throw new Error("Mahsulot tanlang");
  if (!input.customerName.trim()) throw new Error("Mijoz nomi kerak");
  if (!input.phone.trim()) throw new Error("Telefon kerak");
  if (!input.address.trim()) throw new Error("Manzil kerak");

  const db = getDb();
  const settings = getSettings();
  const allowNeg = settings.allow_negative_stock === "1";

  db.exec("BEGIN");
  try {
    const lines: Array<{ p: ReturnType<typeof getProduct>; qty: number; total: number }> = [];
    for (const item of input.items) {
      const p = getProduct(item.product_id);
      if (item.qty <= 0) throw new Error("Miqdor noto'g'ri");
      if (!allowNeg && p.stock + 1e-9 < item.qty) {
        throw new Error(`${p.name}: omborda yetarli emas`);
      }
      lines.push({ p, qty: item.qty, total: Math.round(item.qty * p.sell_price) });
    }
    const subtotal = lines.reduce((s, l) => s + l.total, 0);
    const fee = Math.round(input.deliveryFee || 0);
    const total = subtotal + fee;
    const day = tashkentDate().replace(/-/g, "");
    const count = (db.prepare("SELECT COUNT(*) AS c FROM delivery_orders WHERE number LIKE ?").get(`D-${day}-%`) as { c: number }).c;
    const number = `D-${day}-${String(count + 1).padStart(4, "0")}`;
    const info = db
      .prepare(
        `INSERT INTO delivery_orders (number, user_id, customer_id, customer_name, phone, address, status, subtotal, delivery_fee, total, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)`,
      )
      .run(
        number,
        input.userId,
        input.customerId || null,
        input.customerName.trim(),
        input.phone.trim(),
        input.address.trim(),
        subtotal,
        fee,
        total,
        input.note || null,
        new Date().toISOString(),
      );
    const orderId = Number(info.lastInsertRowid);
    const itemStmt = db.prepare(
      `INSERT INTO delivery_order_items (order_id, product_id, name, unit, qty, sell_price, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const stockStmt = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
    for (const line of lines) {
      itemStmt.run(orderId, line.p.id, line.p.name, line.p.unit, line.qty, line.p.sell_price, line.total);
      stockStmt.run(line.qty, line.p.id);
    }
    db.exec("COMMIT");
    return getDeliveryOrder(orderId);
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function updateDeliveryStatus(id: number, status: string, paymentMethod?: string) {
  const allowed = DELIVERY_STATUSES.map((s) => s.id);
  if (!allowed.includes(status as (typeof allowed)[number])) throw new Error("Noto'g'ri holat");
  const db = getDb();
  const order = getDeliveryOrder(id) as SqlRow & { items: SqlRow[] };
  if (order.status === "done" || order.status === "cancelled") {
    throw new Error("Buyurtma yopilgan");
  }

  if (status === "cancelled") {
    db.exec("BEGIN");
    try {
      for (const item of order.items as SqlRow[]) {
        db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").run(item.qty, item.product_id);
      }
      db.prepare("UPDATE delivery_orders SET status = 'cancelled' WHERE id = ?").run(id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    return getDeliveryOrder(id);
  }

  if (status === "done") {
    if (!paymentMethod) throw new Error("To'lov usuli tanlang");
    db.prepare(
      "UPDATE delivery_orders SET status = 'done', payment_method = ?, delivered_at = ? WHERE id = ?",
    ).run(paymentMethod, new Date().toISOString(), id);
    return getDeliveryOrder(id);
  }

  db.prepare("UPDATE delivery_orders SET status = ? WHERE id = ?").run(status, id);
  return getDeliveryOrder(id);
}

type ReceiptData = {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  number: string;
  createdAt: string;
  cashier?: string;
  items: Array<{ name: string; qty: number; unit: string; sell_price: number; total: number }>;
  subtotal?: number;
  discount?: number;
  total: number;
  paid?: number;
  change?: number;
  debt?: number;
  paymentMethod: string;
  footer?: string;
  currency?: string;
  foreignRate?: number;
  foreignPaid?: number;
};

export function buildEscPosReceipt(data: ReceiptData, width = 58) {
  const cols = width >= 80 ? 48 : 32;
  const ESC = "\x1b";
  const GS = "\x1d";
  const init = `${ESC}@`;
  const center = `${ESC}a\x01`;
  const left = `${ESC}a\x00`;
  const boldOn = `${ESC}E\x01`;
  const boldOff = `${ESC}E\x00`;
  const cut = `${GS}V\x00`;
  const line = "-".repeat(cols);

  const pad = (l: string, r: string) => {
    const space = cols - l.length - r.length;
    return space > 0 ? l + " ".repeat(space) + r : `${l.slice(0, cols - r.length - 1)} ${r}`;
  };

  const out: string[] = [init, center, boldOn, data.storeName, boldOff];
  if (data.storeAddress) out.push(data.storeAddress);
  if (data.storePhone) out.push(data.storePhone);
  out.push(data.number, left, line);

  for (const it of data.items) {
    out.push(it.name.slice(0, cols));
    out.push(pad(`${it.qty} ${it.unit} x ${it.sell_price}`, String(it.total)));
  }
  out.push(line);
  if (data.discount) out.push(pad("Chegirma", `-${data.discount}`));
  out.push(boldOn, pad("JAMI", String(data.total)), boldOff);
  out.push(methodLabel(data.paymentMethod));
  if (data.currency === "USD" && data.foreignRate) {
    out.push(`Kurs: 1 USD = ${data.foreignRate} so'm`);
    if (data.foreignPaid) out.push(`USD: ${data.foreignPaid}`);
  }
  if (data.paid != null) out.push(pad("Berildi", String(data.paid)));
  if (data.change) out.push(pad("Qaytim", String(data.change)));
  if (data.debt) out.push(pad("Qarz", String(data.debt)));
  if (data.footer) {
    out.push(line, center, data.footer);
  }
  out.push(left, "", "", cut);
  return out.join("\n");
}

export function saleToReceipt(saleId: number): ReceiptData {
  const sale = getSale(saleId) as SqlRow;
  const settings = getSettings();
  return {
    storeName: settings.store_name || "Do'kon",
    storeAddress: settings.store_address,
    storePhone: settings.store_phone,
    number: String(sale.number),
    createdAt: String(sale.created_at),
    cashier: String(sale.cashier_name || ""),
    items: (sale.items as SqlRow[]).map((it) => ({
      name: String(it.name),
      qty: Number(it.qty),
      unit: String(it.unit),
      sell_price: Number(it.sell_price),
      total: Number(it.total),
    })),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    total: Number(sale.total),
    paid: Number(sale.paid),
    change: Number(sale.change_amount),
    debt: Number(sale.debt_amount),
    paymentMethod: String(sale.payment_method),
    footer: settings.receipt_footer,
    currency: String(sale.currency || "UZS"),
    foreignRate: sale.foreign_rate ? Number(sale.foreign_rate) : undefined,
    foreignPaid: sale.foreign_paid ? Number(sale.foreign_paid) : undefined,
  };
}

export function sendNetworkPrint(content: string) {
  const settings = getSettings();
  const host = settings.printer_ip?.trim();
  if (!host) throw new Error("Printer IP sozlanmagan");
  const port = Number(settings.printer_port || 9100);
  const data = Buffer.from(content, "binary");

  return new Promise<{ ok: true }>((resolve, reject) => {
    const client = net.createConnection({ host, port }, () => {
      client.write(data);
      client.end();
    });
    client.setTimeout(5000);
    client.on("timeout", () => {
      client.destroy();
      reject(new Error("Printer javob bermadi"));
    });
    client.on("error", reject);
    client.on("close", () => resolve({ ok: true }));
  });
}

export const PHASE3_BACKUP_TABLES = ["delivery_orders", "delivery_order_items"];
