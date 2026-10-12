import { addPayment, createCustomer, createProduct, createSale, createStockIn, getDb, getSale } from "./db";
import { createReturn, findSaleByNumber } from "./phase1";

// The shop's voice assistant records what happened at the counter. Every record it makes carries this note,
// and "undo" only ever touches records that carry it.
const AGENT_NOTE = "Agent (ovoz)";
const PAYMENTS: Record<string, string> = { naqd: "naqd", karta: "uzcard", uzcard: "uzcard", humo: "humo", otkazma: "otkazma", nasiya: "qarz", qarz: "qarz" };

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

function customerId(name: string) {
  const clean = name.trim();
  if (!clean) fail("Nasiyaga sotish uchun mijoz ismi kerak");
  const found = getDb().prepare("SELECT id FROM customers WHERE LOWER(name) = LOWER(?)").get(clean) as
    | { id: number }
    | undefined;
  return found?.id ?? Number(createCustomer({ name: clean })?.id);
}

function sale(body: SqlRow) {
  const method = PAYMENTS[String(body.payment || "naqd").toLowerCase()];
  if (!method) fail("To'lov turi noto'g'ri");
  const s = createSale({
    userId: agentUserId(),
    customerId: method === "qarz" ? customerId(String(body.customer || "")) : null,
    paymentMethod: method,
    paid: method === "qarz" ? 0 : undefined,
    note: AGENT_NOTE,
    clientId: body.client_id ? `agent-${String(body.client_id)}` : null,
    items: lines(body.items).map((l) => ({ product_id: l.product_id, qty: l.qty })),
  }) as SqlRow;
  return { kind: "sale", id: Number(s.id), number: s.number, total: s.total, payment: method };
}

function stockIn(body: SqlRow) {
  createStockIn({ userId: agentUserId(), note: AGENT_NOTE, items: lines(body.items) });
  const s = getDb().prepare("SELECT id, number, total FROM stock_ins WHERE note = ? ORDER BY id DESC LIMIT 1").get(AGENT_NOTE) as SqlRow;
  return { kind: "stock_in", id: Number(s.id), number: s.number, total: s.total };
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
      const s = db.prepare("SELECT id FROM stock_ins WHERE id = ? AND note = ?").get(id, AGENT_NOTE);
      if (!s) fail("Bu kirimni Agent yozmagan", 403);
      db.exec("BEGIN");
      try {
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
      return sale(body);
    case "stock_in":
      return stockIn(body);
    case "expense":
      return expense(body);
    case "return":
      return saleReturn(body);
    case "product":
      return product(body);
    case "undo":
      return undo(body);
    default:
      fail("Noma'lum amal");
  }
}
