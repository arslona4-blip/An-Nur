import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDb, getSale, getSettings } from "./db";
import { som, tashkentDateTime } from "./format";

type SqlRow = Record<string, unknown>;

const PHASE4 = "phase4-v1";

function row<T>(r: SqlRow | undefined) {
  return r as T | null;
}

function rows<T>(list: SqlRow[]) {
  return list as T[];
}

export function migratePhase4(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sms_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      provider TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS offline_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    );
  `);

  const branchCol = (
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('sales') WHERE name = 'branch_id'").get() as { c: number }
  ).c;
  if (!branchCol) db.exec("ALTER TABLE sales ADD COLUMN branch_id INTEGER REFERENCES branches(id)");

  const fiscalCol = (
    db.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('sales') WHERE name = 'fiscal_qr'").get() as { c: number }
  ).c;
  if (!fiscalCol) db.exec("ALTER TABLE sales ADD COLUMN fiscal_qr TEXT");

  const hasBranch = (db.prepare("SELECT COUNT(*) AS c FROM branches").get() as { c: number }).c;
  if (!hasBranch) {
    db.prepare("INSERT INTO branches (name, address, phone, active, created_at) VALUES (?, ?, ?, 1, ?)").run(
      "Asosiy filial",
      "",
      "",
      new Date().toISOString(),
    );
  }

  const defaults: Record<string, string> = {
    current_branch_id: "1",
    fiscal_enabled: "0",
    store_tin: "",
    fiscal_merchant_name: "",
    sms_enabled: "0",
    sms_provider: "eskiz",
    sms_email: "",
    sms_token: "",
    sms_sender: "4546",
    sms_password: "",
    offline_mode_enabled: "1",
  };
  const ins = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING");
  for (const [k, v] of Object.entries(defaults)) ins.run(k, v);

  const curBranch = db.prepare("SELECT value FROM settings WHERE key = 'current_branch_id'").get() as
    | { value: string }
    | undefined;
  if (!curBranch?.value) {
    const first = db.prepare("SELECT id FROM branches ORDER BY id LIMIT 1").get() as { id: number } | undefined;
    if (first) {
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
        "current_branch_id",
        String(first.id),
      );
    }
  }

  const ver = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (ver?.value === PHASE4) return;
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "schema_version",
    PHASE4,
  );
}

export function listBranches() {
  return rows<SqlRow>(getDb().prepare("SELECT * FROM branches ORDER BY name").all());
}

export function getCurrentBranchId() {
  const settings = getSettings();
  return Number(settings.current_branch_id || 1);
}

export function setCurrentBranch(id: number) {
  const b = row<SqlRow>(getDb().prepare("SELECT id FROM branches WHERE id = ? AND active = 1").get(id));
  if (!b) throw new Error("Filial topilmadi");
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run("current_branch_id", String(id));
  return getCurrentBranch();
}

export function getCurrentBranch() {
  const id = getCurrentBranchId();
  return row<SqlRow>(getDb().prepare("SELECT * FROM branches WHERE id = ?").get(id));
}

export function createBranch(input: { name: string; address?: string; phone?: string }) {
  if (!input.name.trim()) throw new Error("Filial nomi kerak");
  const info = getDb()
    .prepare("INSERT INTO branches (name, address, phone, active, created_at) VALUES (?, ?, ?, 1, ?)")
    .run(input.name.trim(), input.address?.trim() || null, input.phone?.trim() || null, new Date().toISOString());
  return row<SqlRow>(getDb().prepare("SELECT * FROM branches WHERE id = ?").get(Number(info.lastInsertRowid)));
}

export function updateBranch(id: number, patch: { name?: string; address?: string; phone?: string; active?: boolean }) {
  const cur = row<SqlRow>(getDb().prepare("SELECT * FROM branches WHERE id = ?").get(id));
  if (!cur) throw new Error("Filial topilmadi");
  getDb()
    .prepare("UPDATE branches SET name=?, address=?, phone=?, active=? WHERE id=?")
    .run(
      patch.name?.trim() || cur.name,
      patch.address ?? cur.address,
      patch.phone ?? cur.phone,
      patch.active === undefined ? cur.active : patch.active ? 1 : 0,
      id,
    );
  return row<SqlRow>(getDb().prepare("SELECT * FROM branches WHERE id = ?").get(id));
}

export function buildFiscalQr(saleId: number) {
  const settings = getSettings();
  if (settings.fiscal_enabled !== "1") return null;
  const sale = getSale(saleId) as SqlRow;
  const payload = {
    v: 1,
    tin: settings.store_tin || "",
    merchant: settings.fiscal_merchant_name || settings.store_name || "Do'kon",
    receipt: String(sale.number),
    time: String(sale.created_at),
    total: Number(sale.total),
    vat: 0,
    fn: "HISOB",
    hash: createHash("sha256")
      .update(`${sale.number}:${sale.total}:${sale.created_at}`)
      .digest("hex")
      .slice(0, 16),
  };
  const qr = JSON.stringify(payload);
  getDb().prepare("UPDATE sales SET fiscal_qr = ? WHERE id = ?").run(qr, saleId);
  return { payload, qr, url: `https://hisob.local/check?${encodeURIComponent(String(sale.number))}` };
}

export function getFiscalQr(saleId: number) {
  const sale = row<SqlRow>(getDb().prepare("SELECT fiscal_qr, number, total, created_at FROM sales WHERE id = ?").get(saleId));
  if (!sale) throw new Error("Savdo topilmadi");
  if (sale.fiscal_qr) return { qr: String(sale.fiscal_qr), sale };
  return buildFiscalQr(saleId);
}

let smsTokenCache: { token: string; exp: number } | null = null;

async function eskizToken() {
  const settings = getSettings();
  const email = settings.sms_email?.trim();
  const password = settings.sms_password?.trim();
  if (!email || !password) throw new Error("SMS login sozlanmagan");
  if (smsTokenCache && smsTokenCache.exp > Date.now()) return smsTokenCache.token;
  const res = await fetch("https://notify.eskiz.uz/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as { data?: { token?: string } };
  const token = data.data?.token;
  if (!token) throw new Error("SMS token olinmadi");
  smsTokenCache = { token, exp: Date.now() + 25 * 86400000 };
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run("sms_token", token);
  return token;
}

export async function sendSms(phone: string, message: string) {
  const settings = getSettings();
  if (settings.sms_enabled !== "1") throw new Error("SMS o'chirilgan");
  const normalized = phone.replace(/\D/g, "");
  if (normalized.length < 9) throw new Error("Telefon noto'g'ri");
  const mobile = normalized.startsWith("998") ? normalized : `998${normalized.slice(-9)}`;

  let status = "sent";
  const provider = settings.sms_provider || "eskiz";
  try {
    if (provider === "eskiz") {
      const token = settings.sms_token?.trim() || (await eskizToken());
      const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mobile_phone: mobile,
          message,
          from: settings.sms_sender || "4546",
        }),
      });
      const data = (await res.json()) as { status?: string; message?: string };
      if (data.status === "error") throw new Error(data.message || "SMS xatolik");
    } else {
      throw new Error("Noma'lum SMS provayder");
    }
  } catch (e) {
    status = "failed";
    getDb()
      .prepare("INSERT INTO sms_log (phone, message, status, provider, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(mobile, message, status, provider, new Date().toISOString());
    throw e;
  }

  getDb()
    .prepare("INSERT INTO sms_log (phone, message, status, provider, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(mobile, message, status, provider, new Date().toISOString());
  return { ok: true, phone: mobile };
}

export function listSmsLog(limit = 50) {
  return rows<SqlRow>(
    getDb().prepare("SELECT * FROM sms_log ORDER BY id DESC LIMIT ?").all(limit),
  );
}

export function enqueueOffline(kind: string, payload: unknown) {
  const info = getDb()
    .prepare("INSERT INTO offline_queue (kind, payload, status, created_at) VALUES (?, ?, 'pending', ?)")
    .run(kind, JSON.stringify(payload), new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function listOfflineQueue() {
  return rows<SqlRow>(
    getDb().prepare("SELECT * FROM offline_queue WHERE status = 'pending' ORDER BY id").all(),
  );
}

export function markOfflineSynced(id: number) {
  getDb()
    .prepare("UPDATE offline_queue SET status = 'synced', synced_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function markOfflineFailed(id: number, error: string) {
  getDb().prepare("UPDATE offline_queue SET status = 'failed', error = ? WHERE id = ?").run(error, id);
}

export function smsDebtReminder(customerName: string, debt: number) {
  return `Hurmatli ${customerName}, sizning qarzingiz: ${som(debt)}. Iltimos to'lang.`;
}

export function smsSaleThanks(customerName: string, total: number, number: string) {
  return `${customerName}, xaridingiz uchun rahmat! Chek ${number}, summa ${som(total)}.`;
}

export const PHASE4_BACKUP_TABLES = ["branches", "sms_log", "offline_queue"];
