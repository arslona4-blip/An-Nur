import { getDb, getReports, getSettings, setSettings } from "./db";
import { methodLabel, periodRange, som, tashkentDate } from "./format";

const DEFAULT_HOUR = 21;

function tashkentHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", hour12: false }).format(now));
}

function ownerChats(settings: Record<string, string>) {
  return [
    ...new Set(
      [...String(settings.telegram_admin_ids || "").split(/[,;\s]+/), settings.telegram_chat_id || ""]
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

export function dailySummaryText(day = tashkentDate()) {
  const db = getDb();
  const { start, end } = periodRange(day, day);
  const r = getReports(day, day) as {
    sales: number;
    count: number;
    returns: number;
    revenue: number;
    gross: number;
    expenses: number;
    net: number;
  };
  const methods = db
    .prepare(
      `SELECT payment_method AS m, COALESCE(SUM(total),0) AS t FROM sales
       WHERE created_at >= ? AND created_at < ? GROUP BY payment_method ORDER BY t DESC`,
    )
    .all(start, end) as Array<{ m: string; t: number }>;
  const debtGiven = Number(
    (db.prepare("SELECT COALESCE(SUM(debt_amount),0) AS s FROM sales WHERE created_at >= ? AND created_at < ?").get(start, end) as { s: number }).s,
  );
  const debtBack = Number(
    (
      db
        .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE kind = 'customer' AND created_at >= ? AND created_at < ?")
        .get(start, end) as { s: number }
    ).s,
  );
  const debtTotal = Number((db.prepare("SELECT COALESCE(SUM(debt),0) AS s FROM customers WHERE debt > 0").get() as { s: number }).s);
  const top = db
    .prepare(
      `SELECT si.name, SUM(si.qty) AS q, si.unit FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.created_at >= ? AND s.created_at < ? GROUP BY si.name, si.unit ORDER BY SUM(si.total) DESC LIMIT 3`,
    )
    .all(start, end) as Array<{ name: string; q: number; unit: string }>;
  const low = db
    .prepare("SELECT name FROM products WHERE active = 1 AND min_stock > 0 AND stock <= min_stock ORDER BY stock LIMIT 5")
    .all() as Array<{ name: string }>;

  const store = getSettings().store_name || "Do'kon";
  const lines = [`📊 ${store} — ${day} kun yakuni`, ""];
  if (!r.count) {
    lines.push("Bugun savdo bo'lmadi.");
  } else {
    lines.push(`Savdo: ${r.count} ta chek, ${som(r.sales)}`);
    for (const m of methods) lines.push(`   ${methodLabel(m.m)}: ${som(m.t)}`);
    if (r.returns) lines.push(`Qaytarildi: ${som(r.returns)}`);
    lines.push(`Foyda (yalpi): ${som(r.gross)}`);
  }
  if (r.expenses) lines.push(`Xarajat: ${som(r.expenses)}`);
  lines.push("");
  lines.push(`Qarzga berildi: ${som(debtGiven)}`);
  lines.push(`Qarzdan qaytdi: ${som(debtBack)}`);
  lines.push(`Jami qarzlar: ${som(debtTotal)}`);
  if (top.length) {
    lines.push("", "Eng ko'p sotilgan:");
    for (const t of top) lines.push(`   ${t.name} — ${Math.round(t.q * 1000) / 1000} ${t.unit}`);
  }
  if (low.length) lines.push("", `Tugayapti: ${low.map((p) => p.name).join(", ")}`);
  return lines.join("\n");
}

export async function sendDailySummary(day = tashkentDate()) {
  const settings = getSettings();
  const token = settings.telegram_bot_token?.trim();
  const chats = ownerChats(settings);
  if (!token || !chats.length) throw new Error("Telegram bot yoki egasining ID si sozlanmagan");
  const text = dailySummaryText(day);
  let sent = 0;
  for (const chat of chats) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text }),
        signal: AbortSignal.timeout(10000),
      });
      if (((await res.json()) as { ok?: boolean }).ok) sent++;
    } catch {
      // a chat that fails does not stop the others
    }
  }
  if (!sent) throw new Error("Telegram xabar yubormadi");
  return sent;
}

export async function sendDailySummaryIfDue(now = new Date()) {
  const settings = getSettings();
  if (settings.daily_summary_enabled === "0") return;
  const hour = Number(settings.daily_summary_hour || DEFAULT_HOUR);
  const day = tashkentDate(now);
  if (tashkentHour(now) < hour || settings.daily_summary_sent === day) return;
  if (!settings.telegram_bot_token?.trim() || !ownerChats(settings).length) return;
  await sendDailySummary(day);
  setSettings({ daily_summary_sent: day });
}
