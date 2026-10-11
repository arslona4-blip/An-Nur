import { randomBytes } from "node:crypto";
import path from "node:path";
import { PRODUCT_NAME } from "./brand";
import { createProduct, getDb, getSettings, listCategories, listProducts } from "./db";
import { som } from "./format";
import { createDeliveryOrder, getDeliveryOrder, listDeliveryOrders, updateDeliveryStatus } from "./phase3";
import { recognizeProductFromImage } from "./phase5";

type SessionData = {
  cart?: Array<{ product_id: number; name: string; qty: number; sell_price: number; unit: string }>;
  name?: string;
  phone?: string;
  address?: string;
  ai?: Array<{
    name: string;
    unit: string;
    buy_price: number;
    sell_price: number;
    category_id: number | null;
    image_url: string;
    done?: boolean;
  }>;
};

type Session = {
  chat_id: string;
  state: string;
  data: SessionData;
  updated_at: string;
};

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  photo?: Array<{ file_id: string; file_unique_id: string; width: number; height: number }>;
};
type TgCallback = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
};

function parseIds(raw?: string) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function botToken() {
  return getSettings().telegram_bot_token?.trim() || "";
}

function botEnabled() {
  return getSettings().telegram_bot_enabled === "1" && !!botToken();
}

function roleOf(chatId: string | number): "admin" | "courier" | "customer" {
  const id = String(chatId);
  const s = getSettings();
  if (parseIds(s.telegram_admin_ids).includes(id)) return "admin";
  if (parseIds(s.telegram_courier_ids).includes(id)) return "courier";
  return "customer";
}

function getSession(chatId: string | number): Session {
  const id = String(chatId);
  const row = getDb().prepare("SELECT * FROM telegram_sessions WHERE chat_id = ?").get(id) as
    | { chat_id: string; state: string; data: string; updated_at: string }
    | undefined;
  if (!row) {
    return { chat_id: id, state: "idle", data: {}, updated_at: new Date().toISOString() };
  }
  let data: SessionData = {};
  try {
    data = JSON.parse(row.data || "{}") as SessionData;
  } catch {
    data = {};
  }
  return { chat_id: row.chat_id, state: row.state, data, updated_at: row.updated_at };
}

function saveSession(chatId: string | number, state: string, data: SessionData) {
  const id = String(chatId);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO telegram_sessions (chat_id, state, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET state=excluded.state, data=excluded.data, updated_at=excluded.updated_at`,
    )
    .run(id, state, JSON.stringify(data), now);
}

async function tgApi(method: string, body: Record<string, unknown>) {
  const token = botToken();
  if (!token) throw new Error("Bot token yo‘q");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(data.description || `Telegram ${method} xato`);
  return data.result;
}

export async function tgSend(
  chatId: string | number,
  text: string,
  extra?: { reply_markup?: unknown; parse_mode?: string },
) {
  return tgApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: extra?.parse_mode || "HTML",
    reply_markup: extra?.reply_markup,
  });
}

async function tgAnswer(callbackId: string, text?: string) {
  return tgApi("answerCallbackQuery", { callback_query_id: callbackId, text, show_alert: false });
}

function mainKeyboard(role: "admin" | "courier" | "customer") {
  if (role === "courier") {
    return {
      keyboard: [[{ text: "📦 Buyurtmalar" }, { text: "🚚 Yo‘ldagilar" }], [{ text: "ℹ️ Yordam" }]],
      resize_keyboard: true,
    };
  }
  if (role === "admin") {
    return {
      keyboard: [
        [{ text: "🛍 Katalog" }, { text: "🛒 Savat" }],
        [{ text: "✅ Buyurtma" }, { text: "📦 Buyurtmalar" }],
        [{ text: "📷 Rasm = mahsulot" }, { text: "ℹ️ Yordam" }],
      ],
      resize_keyboard: true,
    };
  }
  return {
    keyboard: [[{ text: "🛍 Katalog" }, { text: "🛒 Savat" }], [{ text: "✅ Buyurtma" }, { text: "ℹ️ Yordam" }]],
    resize_keyboard: true,
  };
}

function cartTotal(cart: SessionData["cart"] = []) {
  return (cart || []).reduce((s, l) => s + Math.round(l.qty * l.sell_price), 0);
}

function formatCart(data: SessionData) {
  const cart = data.cart || [];
  if (!cart.length) return "Savat bo‘sh.";
  const lines = cart.map((l, i) => `${i + 1}. ${l.name} × ${l.qty} = <b>${som(l.qty * l.sell_price)}</b>`);
  lines.push(`\nJami: <b>${som(cartTotal(cart))}</b>`);
  return lines.join("\n");
}

function systemUserId() {
  const u = getDb()
    .prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  if (!u) throw new Error("Admin foydalanuvchi topilmadi");
  return u.id;
}

export async function notifyDeliveryParties(orderId: number) {
  if (!botEnabled()) return;
  const order = getDeliveryOrder(orderId) as {
    number: string;
    customer_name: string;
    phone: string;
    address: string;
    total: number;
    delivery_fee: number;
    items: Array<{ name: string; qty: number; unit: string; total: number }>;
  };
  const items = (order.items || []).map((i) => `• ${i.name} × ${i.qty}`).join("\n");
  const text =
    `<b>Yangi yetkazish</b> ${order.number}\n` +
    `${order.customer_name}\n📞 ${order.phone}\n📍 ${order.address}\n` +
    `${items}\n\nJami: <b>${som(order.total)}</b>`;
  const s = getSettings();
  const targets = new Set([...parseIds(s.telegram_admin_ids), ...parseIds(s.telegram_courier_ids), ...(s.telegram_chat_id ? [s.telegram_chat_id] : [])]);
  for (const chatId of targets) {
    try {
      await tgSend(chatId, text, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Tayyorlash", callback_data: `st:${orderId}:preparing` },
              { text: "Yo‘lda", callback_data: `st:${orderId}:delivering` },
            ],
            [
              { text: "Naqd ✓", callback_data: `done:${orderId}:naqd` },
              { text: "Karta ✓", callback_data: `done:${orderId}:karta` },
            ],
          ],
        },
      });
    } catch {
      /* ignore per-chat errors */
    }
  }
}

async function showCatalog(chatId: string | number) {
  const cats = listCategories();
  if (!cats.length) {
    await showCategoryProducts(chatId, null);
    return;
  }
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row = [{ text: cats[i].name, callback_data: `cat:${cats[i].id}` }];
    if (cats[i + 1]) row.push({ text: cats[i + 1].name, callback_data: `cat:${cats[i + 1].id}` });
    rows.push(row);
  }
  rows.push([{ text: "Barchasi", callback_data: "cat:all" }]);
  await tgSend(chatId, `<b>${PRODUCT_NAME}</b> — toifani tanlang:`, {
    reply_markup: { inline_keyboard: rows },
  });
}

async function showCategoryProducts(chatId: string | number, categoryId: number | null) {
  const products = (
    categoryId ? listProducts({ categoryId }) : listProducts()
  ).slice(0, 25);
  if (!products.length) {
    await tgSend(chatId, "Bu toifada mahsulot yo‘q.");
    return;
  }
  const title = categoryId
    ? listCategories().find((c) => c.id === categoryId)?.name || "Toifa"
    : "Barcha mahsulotlar";
  await tgSend(chatId, `<b>${title}</b> (${products.length}):`);
  for (const p of products) {
    const cat = p.category_name ? ` · ${p.category_name}` : "";
    await tgSend(chatId, `<b>${p.name}</b>${cat}\n${som(p.sell_price)} / ${p.unit}`, {
      reply_markup: {
        inline_keyboard: [[{ text: "➕ Savatga", callback_data: `add:${p.id}` }]],
      },
    });
  }
}

async function listCourierOrders(chatId: string | number, status?: string) {
  const orders = listDeliveryOrders(status).slice(0, 15) as Array<{
    id: number;
    number: string;
    customer_name: string;
    phone: string;
    address: string;
    status: string;
    total: number;
  }>;
  const filtered = status
    ? orders
    : orders.filter((o) => o.status === "new" || o.status === "preparing" || o.status === "delivering");
  if (!filtered.length) {
    await tgSend(chatId, "Faol buyurtma yo‘q.");
    return;
  }
  for (const o of filtered) {
    await tgSend(
      chatId,
      `<b>${o.number}</b> (${o.status})\n${o.customer_name}\n📞 ${o.phone}\n📍 ${o.address}\n${som(o.total)}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Tayyorlash", callback_data: `st:${o.id}:preparing` },
              { text: "Yo‘lda", callback_data: `st:${o.id}:delivering` },
            ],
            [
              { text: "Naqd ✓", callback_data: `done:${o.id}:naqd` },
              { text: "Karta ✓", callback_data: `done:${o.id}:karta` },
              { text: "Bekor", callback_data: `st:${o.id}:cancelled` },
            ],
          ],
        },
      },
    );
  }
}

async function downloadTelegramPhoto(fileId: string): Promise<File> {
  const token = botToken();
  const file = (await tgApi("getFile", { file_id: fileId })) as { file_path?: string };
  if (!file.file_path) throw new Error("Rasm fayli topilmadi");
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!res.ok) throw new Error("Rasm yuklab bo‘lmadi");
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = path.extname(file.file_path).replace(".", "") || "jpg";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new File([new Uint8Array(buf)], `tg.${ext}`, { type: mime });
}

async function handlePhoto(msg: TgMessage) {
  const chatId = msg.chat.id;
  const role = roleOf(chatId);
  if (role !== "admin") {
    await tgSend(chatId, "Rasm orqali mahsulot qo‘shish faqat admin uchun. Admin chat ID ni Sozlamalarga yozing.");
    return;
  }
  const photos = msg.photo || [];
  const best = photos[photos.length - 1];
  if (!best) return;
  await tgSend(chatId, "⏳ Rasm tahlil qilinmoqda...");
  try {
    const file = await downloadTelegramPhoto(best.file_id);
    const { products } = await recognizeProductFromImage(file, { caption: msg.caption || "" });
    const cats = listCategories();
    const ai = products.map((p) => {
      const category = p.category_name
        ? cats.find((c) => c.name.toLowerCase() === p.category_name!.toLowerCase())
        : null;
      return {
        name: p.name,
        unit: p.unit,
        buy_price: p.buy_price,
        sell_price: p.sell_price,
        category_id: category?.id ?? null,
        image_url: p.image_url,
      };
    });
    saveSession(chatId, "ai_confirm", { ...getSession(chatId).data, ai });
    for (let i = 0; i < ai.length; i++) {
      const p = ai[i];
      await tgSend(
        chatId,
        `<b>${p.name}</b>\nToifa: ${cats.find((c) => c.id === p.category_id)?.name || "—"}\nSotish: ${som(p.sell_price)}\nOlish: ${som(p.buy_price)}\n${p.unit}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Saqlash", callback_data: `aisave:${i}` },
                { text: "⏭ O‘tkazish", callback_data: `aisk:${i}` },
              ],
            ],
          },
        },
      );
    }
  } catch (e) {
    await tgSend(chatId, `❌ ${e instanceof Error ? e.message : "Xatolik"}`);
  }
}

async function startOrder(chatId: string | number) {
  const s = getSession(chatId);
  if (!s.data.cart?.length) {
    await tgSend(chatId, "Avval savatga mahsulot qo‘shing.");
    return;
  }
  saveSession(chatId, "ask_name", s.data);
  await tgSend(chatId, `${formatCart(s.data)}\n\nIsmingizni yozing:`);
}

async function handleText(msg: TgMessage) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const role = roleOf(chatId);
  const session = getSession(chatId);

  if (text === "/start" || text === "ℹ️ Yordam") {
    saveSession(chatId, "idle", session.data);
    const help =
      role === "courier"
        ? `<b>${PRODUCT_NAME} kuryer boti</b>\nBuyurtmalar holatini yangilang.`
        : role === "admin"
          ? `<b>${PRODUCT_NAME} admin boti</b>\nBuyurtma + rasm yuborib mahsulot qo‘shing.`
          : `<b>${PRODUCT_NAME} yetkazib berish</b>\nKatalog → Savat → Buyurtma.`;
    await tgSend(chatId, `${help}\n\nSizning chat ID: <code>${chatId}</code>`, {
      reply_markup: mainKeyboard(role),
    });
    return;
  }

  if (text === "🛍 Katalog") {
    await showCatalog(chatId);
    return;
  }
  if (text === "🛒 Savat") {
    await tgSend(chatId, formatCart(session.data), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Tozalash", callback_data: "cartclear" },
            { text: "Buyurtma ✅", callback_data: "orderstart" },
          ],
        ],
      },
    });
    return;
  }
  if (text === "✅ Buyurtma") {
    await startOrder(chatId);
    return;
  }
  if (text === "📦 Buyurtmalar" || text === "🚚 Yo‘ldagilar") {
    if (role === "customer") {
      await tgSend(chatId, "Buyurtmalar paneli kuryer/admin uchun.");
      return;
    }
    await listCourierOrders(chatId, text.includes("Yo‘lda") ? "delivering" : undefined);
    return;
  }
  if (text === "📷 Rasm = mahsulot") {
    await tgSend(chatId, "Mahsulot rasmini (yoki Telegram skrinshotini) shu yerga yuboring.");
    return;
  }

  if (session.state === "ask_name") {
    saveSession(chatId, "ask_phone", { ...session.data, name: text });
    await tgSend(chatId, "Telefon raqamingizni yozing (+998...):");
    return;
  }
  if (session.state === "ask_phone") {
    saveSession(chatId, "ask_address", { ...session.data, phone: text });
    await tgSend(chatId, "Yetkazib berish manzilini yozing:");
    return;
  }
  if (session.state === "ask_address") {
    const data = { ...session.data, address: text };
    saveSession(chatId, "confirm", data);
    const fee = Number(getSettings().delivery_fee_default || 0);
    await tgSend(
      chatId,
      `${formatCart(data)}\n\n👤 ${data.name}\n📞 ${data.phone}\n📍 ${data.address}\nYetkazish: ${som(fee)}\n\nTasdiqlaysizmi?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Tasdiqlash", callback_data: "orderok" },
              { text: "❌ Bekor", callback_data: "ordercancel" },
            ],
          ],
        },
      },
    );
    return;
  }

  await tgSend(chatId, "Menyu tugmalaridan foydalaning yoki /start bosing.", {
    reply_markup: mainKeyboard(role),
  });
}

async function handleCallback(cb: TgCallback) {
  const chatId = cb.message?.chat.id;
  if (!chatId) return;
  const data = cb.data || "";
  const session = getSession(chatId);
  await tgAnswer(cb.id);

  if (data.startsWith("add:")) {
    const id = Number(data.slice(4));
    const p = listProducts().find((x) => x.id === id);
    if (!p) {
      await tgSend(chatId, "Mahsulot topilmadi");
      return;
    }
    const cart = [...(session.data.cart || [])];
    const ex = cart.find((c) => c.product_id === id);
    if (ex) ex.qty += 1;
    else cart.push({ product_id: p.id, name: p.name, qty: 1, sell_price: p.sell_price, unit: p.unit });
    saveSession(chatId, session.state, { ...session.data, cart });
    await tgSend(chatId, `➕ ${p.name} savatga qo‘shildi\n${formatCart({ cart })}`);
    return;
  }

  if (data.startsWith("cat:")) {
    const raw = data.slice(4);
    if (raw === "all") await showCategoryProducts(chatId, null);
    else await showCategoryProducts(chatId, Number(raw));
    return;
  }

  if (data === "cartclear") {
    saveSession(chatId, "idle", { ...session.data, cart: [] });
    await tgSend(chatId, "Savat tozalandi.");
    return;
  }
  if (data === "orderstart") {
    await startOrder(chatId);
    return;
  }
  if (data === "ordercancel") {
    saveSession(chatId, "idle", session.data);
    await tgSend(chatId, "Buyurtma bekor qilindi.");
    return;
  }
  if (data === "orderok") {
    try {
      const fee = Number(getSettings().delivery_fee_default || 0);
      const order = createDeliveryOrder({
        userId: systemUserId(),
        customerName: session.data.name || cb.from.first_name || "Mijoz",
        phone: session.data.phone || "",
        address: session.data.address || "",
        deliveryFee: fee,
        note: `Telegram chat ${chatId}`,
        items: (session.data.cart || []).map((c) => ({ product_id: c.product_id, qty: c.qty })),
      }) as unknown as { id: number; number: string; total: number };
      saveSession(chatId, "idle", { cart: [] });
      await tgSend(chatId, `✅ Buyurtma qabul qilindi: <b>${order.number}</b>\nJami: ${som(order.total)}`);
      await notifyDeliveryParties(order.id);
    } catch (e) {
      await tgSend(chatId, `❌ ${e instanceof Error ? e.message : "Xatolik"}`);
    }
    return;
  }

  if (data.startsWith("st:")) {
    if (roleOf(chatId) === "customer") {
      await tgSend(chatId, "Holatni faqat kuryer/admin o‘zgartira oladi.");
      return;
    }
    const [, idStr, status] = data.split(":");
    try {
      const order = updateDeliveryStatus(Number(idStr), status) as unknown as { number: string; status: string };
      await tgSend(chatId, `${order.number} → <b>${order.status}</b>`);
    } catch (e) {
      await tgSend(chatId, `❌ ${e instanceof Error ? e.message : "Xatolik"}`);
    }
    return;
  }

  if (data.startsWith("done:")) {
    if (roleOf(chatId) === "customer") {
      await tgSend(chatId, "Holatni faqat kuryer/admin o‘zgartira oladi.");
      return;
    }
    const [, idStr, method] = data.split(":");
    try {
      const order = updateDeliveryStatus(Number(idStr), "done", method) as unknown as { number: string };
      await tgSend(chatId, `✅ ${order.number} yetkazildi (${method})`);
    } catch (e) {
      await tgSend(chatId, `❌ ${e instanceof Error ? e.message : "Xatolik"}`);
    }
    return;
  }

  if (data.startsWith("aisave:") || data.startsWith("aisk:")) {
    if (roleOf(chatId) !== "admin") return;
    const idx = Number(data.split(":")[1]);
    const ai = [...(session.data.ai || [])];
    const item = ai[idx];
    if (!item || item.done) {
      await tgSend(chatId, "Bu mahsulot allaqachon qayta ishlangan.");
      return;
    }
    if (data.startsWith("aisave:")) {
      createProduct({
        name: item.name,
        unit: item.unit,
        buy_price: item.buy_price,
        sell_price: item.sell_price,
        category_id: item.category_id,
        image_url: item.image_url,
      });
      await tgSend(chatId, `✅ Saqlandi: <b>${item.name}</b> — ${som(item.sell_price)}`);
    } else {
      await tgSend(chatId, `O‘tkazib yuborildi: ${item.name}`);
    }
    ai[idx] = { ...item, done: true };
    const left = ai.some((x) => !x.done);
    saveSession(chatId, left ? "ai_confirm" : "idle", { ...session.data, ai });
    return;
  }
}

export async function handleTelegramUpdate(update: TgUpdate) {
  if (!botEnabled()) return { skipped: true };
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return { ok: true };
    }
    const msg = update.message;
    if (!msg) return { ok: true };
    if (msg.photo?.length) {
      await handlePhoto(msg);
      return { ok: true };
    }
    if (msg.text) {
      await handleText(msg);
      return { ok: true };
    }
    return { ok: true };
  } catch (e) {
    console.error("telegram bot", e);
    return { ok: false, error: e instanceof Error ? e.message : "xato" };
  }
}

export async function setTelegramWebhook(publicBaseUrl: string) {
  const token = botToken();
  if (!token) throw new Error("Bot token yo‘q");
  const base = publicBaseUrl.replace(/\/$/, "");
  const secret = getSettings().telegram_webhook_secret?.trim() || randomBytes(24).toString("hex");
  const url = `${base}/api/telegram/webhook`;
  await tgApi("setWebhook", {
    url,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
    secret_token: secret,
  });
  const upsert = getDb().prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  upsert.run("telegram_webhook_url", base);
  upsert.run("telegram_webhook_secret", secret);
  return { url };
}

export async function deleteTelegramWebhook() {
  await tgApi("deleteWebhook", { drop_pending_updates: false });
  return { ok: true };
}
