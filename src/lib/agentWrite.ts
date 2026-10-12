import {
  addPayment,
  createCustomer,
  createProduct,
  createStockIn,
  createSupplier,
  getDb,
  getProduct,
  getSale,
  updateProduct,
} from "./db";
import { som } from "./format";
import { createReturn, findSaleByNumber } from "./phase1";

// The shop's voice assistant records what happened at the counter. Every record it makes carries this note,
// and "undo" only ever touches records that carry it.
const AGENT_NOTE = "Agent (ovoz)";
type Line = { product_id: number; qty: number; buy_price?: number; sell_price?: number };
type SqlRow = Record<string, unknown>;

function fail(message: string, status = 400): never {
  const err = new Error(message);
  (err as Error & { status: number }).status = status;
  throw err;
}

// Sales join the shift of whoever records them, so the assistant records as the cashier on duty; otherwise
// its sales would sit outside the open shift and never show on the till's shift screen or cash count.
function agentUserId() {
  const db = getDb();
  const onDuty = db
    .prepare(
      `SELECT u.id FROM shifts s JOIN users u ON u.id = s.user_id
       WHERE s.status = 'open' AND u.active = 1 ORDER BY s.id DESC LIMIT 1`,
    )
    .get() as { id: number } | undefined;
  if (onDuty) return onDuty.id;
  const admin = db
    .prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!admin) fail("Faol admin topilmadi");
  return admin.id;
}

function lines(items: unknown): Line[] {
  if (!Array.isArray(items) || !items.length) fail("Mahsulot ko'rsatilmagan");
  return items.map((i: Line) => ({
    product_id: Number(i.product_id),
    qty: Number(i.qty),
    buy_price: i.buy_price === undefined ? undefined : Number(i.buy_price),
    sell_price: i.sell_price === undefined ? undefined : Number(i.sell_price),
  }));
}

// Spoken names are matched to a customer or supplier: an exact name wins, a single name starting with it is
// taken, several are asked about, and an unknown name becomes a new entry.
function party(table: "customers" | "suppliers", name: string, who: string) {
  const clean = name.trim();
  if (!clean) fail(`${who} ismini ayting`);
  const db = getDb();
  const exact = db.prepare(`SELECT * FROM ${table} WHERE LOWER(name) = LOWER(?)`).all(clean) as SqlRow[];
  const found = exact.length ? exact : (db.prepare(`SELECT * FROM ${table} WHERE LOWER(name) LIKE LOWER(?)`).all(`${clean}%`) as SqlRow[]);
  if (found.length > 1) {
    fail(`Ro'yxatda bir nechta «${clean}» bor: ${found.slice(0, 4).map((r) => r.name).join(", ")}. Qaysi biri ekanini to'liq ayting`);
  }
  if (found.length === 1) return { row: found[0], created: false };
  const row = (table === "customers" ? createCustomer({ name: clean }) : createSupplier({ name: clean })) as SqlRow;
  return { row, created: true };
}

const CART_METHODS: Record<string, string> = { naqd: "naqd", karta: "uzcard", otkazma: "otkazma", nasiya: "qarz", qarz: "qarz" };
const CART_WORDS: Record<string, string> = { uzcard: "kartaga", otkazma: "o'tkazma bilan", qarz: "nasiyaga" };

// A spoken sale goes into the till's cart; the cashier takes the payment there as with any other sale.
// Lines nobody picked up within this window are dropped rather than appearing in a later customer's cart.
const CART_TTL_MS = 10 * 60 * 1000;

function cart(body: SqlRow) {
  const items = lines(body.items).map((l) => {
    const p = getProduct(l.product_id) as SqlRow;
    if (!Number(p.active)) fail(`${p.name} sotuvda yo'q`);
    if (!(l.qty > 0)) fail("Miqdor noto'g'ri");
    return { product_id: l.product_id, qty: l.qty, name: String(p.name), unit: String(p.unit), price: Number(p.sell_price) };
  });
  const method = CART_METHODS[String(body.payment || "naqd").toLowerCase()] || "naqd";
  const customer = method === "qarz" ? party("customers", String(body.customer || ""), "Nasiya uchun mijozning") : null;
  const info = getDb()
    .prepare("INSERT INTO agent_cart (items, customer_id, payment, created_at) VALUES (?, ?, ?, ?)")
    .run(
      JSON.stringify(items.map(({ product_id, qty }) => ({ product_id, qty }))),
      customer ? Number(customer.row.id) : null,
      method,
      new Date().toISOString(),
    );
  const total = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0));
  const what = items.map((i) => `${i.name} ${i.qty} ${i.unit}`).join(", ");
  let say = `Savatchaga qo'shdim: ${what}, ${som(total)}`;
  if (customer) {
    say += `, ${customer.row.name} nomiga nasiyaga.`;
    if (customer.created) say += " U yangi mijoz sifatida qo'shildi.";
    else if (Number(customer.row.debt) > 0) say += ` Oldingi qarzi ${som(Number(customer.row.debt))}.`;
  } else {
    say += CART_WORDS[method] ? `, ${CART_WORDS[method]}.` : ".";
  }
  return { kind: "cart", id: Number(info.lastInsertRowid), total, say };
}

export function takeAgentCart() {
  const db = getDb();
  const since = new Date(Date.now() - CART_TTL_MS).toISOString();
  db.exec("BEGIN");
  try {
    const rows = db
      .prepare("SELECT id, items, customer_id, payment FROM agent_cart WHERE taken_at IS NULL AND created_at >= ? ORDER BY id")
      .all(since) as Array<{ id: number; items: string; customer_id: number | null; payment: string | null }>;
    const now = new Date().toISOString();
    for (const r of rows) db.prepare("UPDATE agent_cart SET taken_at = ? WHERE id = ?").run(now, r.id);
    db.exec("COMMIT");
    return rows.map((r) => ({
      payment: r.payment || "naqd",
      customer: r.customer_id
        ? ((db.prepare("SELECT id, name, phone, debt FROM customers WHERE id = ?").get(r.customer_id) as SqlRow | undefined) ?? null)
        : null,
      lines: (JSON.parse(r.items) as Array<{ product_id: number; qty: number }>).flatMap((i) => {
        try {
          return [{ product: getProduct(i.product_id), qty: i.qty }];
        } catch {
          return [];
        }
      }),
    }));
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Without a supplier this is a plain stock count; with one it is a delivery, paid in full unless the
// assistant passes what was actually paid, and the rest becomes what the shop owes that supplier.
function stockIn(body: SqlRow) {
  const items = lines(body.items);
  const supplier = String(body.supplier || "").trim() ? party("suppliers", String(body.supplier), "Ta'minotchi") : null;
  const total = items.reduce((s, l) => s + Math.round(l.qty * Math.round(l.buy_price ?? Number(getProduct(l.product_id).buy_price))), 0);
  const paid = supplier ? Math.min(total, Math.max(0, body.paid === undefined || body.paid === null ? total : Number(body.paid))) : 0;
  createStockIn({ userId: agentUserId(), supplierId: supplier ? Number(supplier.row.id) : null, paid, note: AGENT_NOTE, items });
  const s = getDb().prepare("SELECT id, number, total FROM stock_ins WHERE note = ? ORDER BY id DESC LIMIT 1").get(AGENT_NOTE) as SqlRow;
  const what = items.map((l) => { const p = getProduct(l.product_id); return `${p.name} ${l.qty} ${p.unit}`; }).join(", ");
  let say = `Kirim yozildi: ${what}`;
  if (supplier) {
    say += `, ${supplier.row.name}dan, jami ${som(total)}.`;
    if (supplier.created) say += " U yangi ta'minotchi sifatida qo'shildi.";
    if (total - paid <= 0) say += " To'liq to'landi.";
    else if (paid > 0) say += ` ${som(paid)} to'landi, ${som(total - paid)} qarz bo'ldi.`;
    else say += ` Hammasi qarzga olindi, ${supplier.row.name}ga ${som(total)} qarzmiz.`;
  } else {
    say += ". Qoldiq ko'paydi.";
  }
  return { kind: "stock_in", id: Number(s.id), number: s.number, total: s.total, say };
}

function price(body: SqlRow) {
  const p = getProduct(Number(body.product_id));
  const next = Math.round(Number(body.sell_price));
  if (!(next > 0)) fail("Yangi narxni ayting");
  updateProduct(p.id, { sell_price: next });
  return {
    kind: "price",
    id: p.id,
    old: p.sell_price,
    total: next,
    say: `${p.name} narxi ${som(p.sell_price)} edi, endi ${som(next)}.`,
  };
}

// The till announces each finished sale on the shop's computer; it asks for the sales after the last one it saw.
export function tillEvents(after: number | null) {
  const db = getDb();
  const last = (db.prepare("SELECT COALESCE(MAX(id),0) AS id FROM sales").get() as { id: number }).id;
  if (after === null || !Number.isFinite(after)) return { last, sales: [] };
  const sales = db
    .prepare(
      `SELECT s.id, s.total, s.payment_method, c.name AS customer_name FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id > ? ORDER BY s.id LIMIT 20`,
    )
    .all(after) as SqlRow[];
  return {
    last,
    sales: sales.map((s) => ({
      ...s,
      low: db
        .prepare(
          `SELECT DISTINCT p.name, p.stock, p.unit FROM sale_items si JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = ? AND p.min_stock > 0 AND p.stock <= p.min_stock`,
        )
        .all(Number(s.id)),
    })),
  };
}

function expense(body: SqlRow) {
  const note = [AGENT_NOTE, String(body.note || "").trim()].filter(Boolean).join(": ");
  addPayment({ userId: agentUserId(), kind: "expense", amount: Number(body.amount), category: body.category ? String(body.category) : undefined, note });
  const p = getDb().prepare("SELECT id, amount FROM payments WHERE kind = 'expense' AND note = ? ORDER BY id DESC LIMIT 1").get(note) as SqlRow;
  return { kind: "expense", id: Number(p.id), total: p.amount };
}

// Returns come back from the most recent sale of that product that still has enough left to return.
function saleReturn(body: SqlRow) {
  const productId = Number(body.product_id);
  const qty = Number(body.qty);
  if (!(qty > 0)) fail("Miqdor noto'g'ri");
  const sales = getDb()
    .prepare(
      `SELECT DISTINCT s.id, s.number FROM sales s JOIN sale_items si ON si.sale_id = s.id
       WHERE si.product_id = ? ORDER BY s.created_at DESC LIMIT 50`,
    )
    .all(productId) as Array<{ id: number; number: string }>;
  for (const s of sales) {
    const full = findSaleByNumber(s.number) as SqlRow & { items: SqlRow[] };
    const item = full.items.find((i) => Number(i.product_id) === productId && Number(i.qty) - Number(i.returned) + 1e-9 >= qty);
    if (!item) continue;
    const r = createReturn({
      userId: agentUserId(),
      saleId: s.id,
      refundMethod: String(full.payment_method) === "qarz" ? "qarz" : "naqd",
      note: AGENT_NOTE,
      items: [{ sale_item_id: Number(item.id), qty }],
    }) as SqlRow;
    return { kind: "return", id: Number(r.id), number: r.number, total: r.total };
  }
  fail("Bu mahsulotning qaytariladigan savdosi topilmadi");
}

function product(body: SqlRow) {
  const name = String(body.name || "").trim();
  if (!name) fail("Mahsulot nomi kerak");
  if (getDb().prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND active = 1").get(name)) {
    fail(`${name} kassada allaqachon bor`);
  }
  const p = createProduct({
    name,
    sell_price: Number(body.sell_price) || 0,
    buy_price: Number(body.buy_price) || 0,
    unit: body.unit ? String(body.unit) : undefined,
    stock: Number(body.stock) || 0,
    barcode: body.barcode ? String(body.barcode) : undefined,
  }) as SqlRow;
  return { kind: "product", id: Number(p.id), name: p.name, total: p.sell_price };
}

function undo(body: SqlRow) {
  const id = Number(body.id);
  const db = getDb();
  switch (body.kind) {
    case "cart": {
      const info = db.prepare("DELETE FROM agent_cart WHERE id = ? AND taken_at IS NULL").run(id);
      if (!info.changes) fail("Mahsulot savatchaga tushib bo'lgan, uni kassada savatchadan o'chiring");
      return { kind: "cart", id };
    }
    case "sale": {
      const s = getSale(id) as SqlRow;
      if (s.note !== AGENT_NOTE) fail("Bu savdoni Agent yozmagan", 403);
      const full = findSaleByNumber(String(s.number)) as SqlRow & { items: SqlRow[] };
      const items = full.items
        .map((i) => ({ sale_item_id: Number(i.id), qty: Number(i.qty) - Number(i.returned) }))
        .filter((i) => i.qty > 1e-9);
      if (!items.length) fail("Bu savdo allaqachon qaytarilgan");
      createReturn({ userId: agentUserId(), saleId: id, refundMethod: s.payment_method === "qarz" ? "qarz" : "naqd", note: `${AGENT_NOTE}: bekor qilindi`, items });
      return { kind: "sale", id };
    }
    case "expense": {
      const info = db.prepare("DELETE FROM payments WHERE id = ? AND kind = 'expense' AND note LIKE ?").run(id, `${AGENT_NOTE}%`);
      if (!info.changes) fail("Bu xarajatni Agent yozmagan", 403);
      return { kind: "expense", id };
    }
    case "stock_in": {
      const s = db.prepare("SELECT id, supplier_id, total, paid FROM stock_ins WHERE id = ? AND note = ?").get(id, AGENT_NOTE) as
        | SqlRow
        | undefined;
      if (!s) fail("Bu kirimni Agent yozmagan", 403);
      db.exec("BEGIN");
      try {
        const owed = Number(s.total) - Number(s.paid);
        if (s.supplier_id && owed > 0) {
          db.prepare("UPDATE suppliers SET payable = payable - ? WHERE id = ?").run(owed, Number(s.supplier_id));
        }
        for (const it of db.prepare("SELECT product_id, qty FROM stock_in_items WHERE stock_in_id = ?").all(id) as SqlRow[]) {
          db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(Number(it.qty), Number(it.product_id));
        }
        db.prepare("DELETE FROM stock_in_items WHERE stock_in_id = ?").run(id);
        db.prepare("DELETE FROM stock_ins WHERE id = ?").run(id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return { kind: "stock_in", id };
    }
    case "price": {
      const old = Math.round(Number(body.old));
      if (!(old > 0)) fail("Eski narx noma'lum");
      updateProduct(getProduct(id).id, { sell_price: old });
      return { kind: "price", id };
    }
    case "product": {
      const info = db
        .prepare("UPDATE products SET active = 0 WHERE id = ? AND NOT EXISTS (SELECT 1 FROM sale_items WHERE product_id = ?)")
        .run(id, id);
      if (!info.changes) fail("Bu mahsulot sotilgan, o'chirib bo'lmaydi");
      return { kind: "product", id };
    }
    default:
      fail("Buni bekor qilib bo'lmaydi");
  }
}

export function agentAction(body: SqlRow) {
  switch (body?.action) {
    case "sale":
      return cart(body);
    case "stock_in":
      return stockIn(body);
    case "expense":
      return expense(body);
    case "return":
      return saleReturn(body);
    case "product":
      return product(body);
    case "price":
      return price(body);
    case "undo":
      return undo(body);
    default:
      fail("Noma'lum amal");
  }
}
