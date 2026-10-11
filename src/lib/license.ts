import { createHash, createPublicKey, verify } from "node:crypto";
import { getDb, getSettings } from "./db";

// Public half of the subscription panel's signing key. Only the panel can issue a valid paid-until date.
const PANEL_PUBLIC_KEY = createPublicKey(`-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5dZ/9QhYY8LR0zPbjfKEJB3yATRq+X4Kok+uBowKtxQ=
-----END PUBLIC KEY-----`);

const DAY = 86400000;
const FIRST_RUN_DAYS = 3;
const REFRESH_OK_MS = 6 * 3600000;
const REFRESH_RETRY_MS = 15 * 60000;

type TokenPayload = {
  s: number;
  n: string;
  f: string;
  u: string;
  a: boolean;
  g: number;
  w: number;
  i: string;
  p?: { c: string; h?: string; t?: string; m?: number };
};

export type PayInfo = { card: string; holder: string; phone: string; amount: number | null };

export type LicenseCode = "off" | "ok" | "soon" | "grace" | "pending" | "blocked";

export type LicenseState = {
  code: LicenseCode;
  message: string;
  daysLeft: number | null;
  paidUntil: string | null;
  shopName: string | null;
  checkedAt: string | null;
  lastError: string | null;
  pay: PayInfo | null;
};

function payInfo(payload: TokenPayload): PayInfo | null {
  if (!payload.p?.c) return null;
  return { card: payload.p.c, holder: payload.p.h || "", phone: payload.p.t || "", amount: payload.p.m ?? null };
}

const runtime = globalThis as unknown as { annurLicense?: { lastTry: number; inFlight: boolean } };
const state = (runtime.annurLicense ??= { lastTry: 0, inFlight: false });

function licenseKey() {
  return process.env.ANNUR_LICENSE_KEY?.trim().toUpperCase() || "";
}

function panelUrl() {
  return (process.env.ANNUR_LICENSE_URL || "").trim().replace(/\/$/, "");
}

function saveSetting(key: string, value: string) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

function readToken(token: string, key: string): TokenPayload | null {
  const [body, sig] = token.trim().split(".");
  if (!body || !sig) return null;
  try {
    if (!verify(null, Buffer.from(body), PANEL_PUBLIC_KEY, Buffer.from(sig, "base64url"))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    const fingerprint = createHash("sha256").update(key).digest("hex").slice(0, 16);
    return payload.f === fingerprint ? payload : null;
  } catch {
    return null;
  }
}

function tashkentDay(ms: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date(ms));
}

function dayMs(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Turning the shop PC's clock back must not revive an expired subscription.
function trustedNow(settings: Record<string, string>, payload: TokenPayload | null) {
  const seen = Number(settings.license_clock || 0);
  const issued = payload ? Date.parse(payload.i) || 0 : 0;
  const now = Math.max(Date.now(), seen, issued);
  if (now - seen > 3600000) saveSetting("license_clock", String(now));
  return now;
}

async function refresh(force = false) {
  const key = licenseKey();
  const url = panelUrl();
  if (!key || !url || state.inFlight) return;
  const settings = getSettings();
  const hasToken = Boolean(settings.license_token);
  const wait = hasToken && !settings.license_error ? REFRESH_OK_MS : REFRESH_RETRY_MS;
  if (!force && Date.now() - state.lastTry < wait) return;
  state.lastTry = Date.now();
  state.inFlight = true;
  try {
    const res = await fetch(`${url}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, version: process.env.npm_package_version || "", store: settings.store_name || "" }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
    if (!res.ok || !data.token) throw new Error(data.error || `Panel javobi: ${res.status}`);
    if (!readToken(data.token, key)) throw new Error("Panel imzosi noto‘g‘ri");
    saveSetting("license_token", data.token);
    saveSetting("license_checked_at", new Date().toISOString());
    saveSetting("license_error", "");
  } catch (e) {
    saveSetting("license_error", e instanceof Error ? e.message : "Aloqa yo‘q");
  } finally {
    state.inFlight = false;
  }
}

export function licenseStatus(): LicenseState {
  const key = licenseKey();
  const base = { daysLeft: null, paidUntil: null, shopName: null, checkedAt: null, lastError: null, pay: null };
  if (!key) return { ...base, code: "off", message: "" };
  void refresh();

  const settings = getSettings();
  const payload = settings.license_token ? readToken(settings.license_token, key) : null;
  const now = trustedNow(settings, payload);
  const info = {
    checkedAt: settings.license_checked_at || null,
    lastError: settings.license_error || null,
  };

  if (!payload) {
    let first = Number(settings.license_first_seen || 0);
    if (!first) {
      first = now;
      saveSetting("license_first_seen", String(first));
    }
    const left = FIRST_RUN_DAYS - Math.floor((now - first) / DAY);
    if (left > 0) {
      return {
        ...base,
        ...info,
        code: "pending",
        daysLeft: left,
        message: `Kassa obuna serveriga hali ulanmadi. Internetni tekshiring yoki faollashtirish kodini kiriting (${left} kun qoldi).`,
      };
    }
    return {
      ...base,
      ...info,
      code: "blocked",
      message: "Kassa faollashtirilmagan. Sotuvchingizdan faollashtirish kodini oling.",
    };
  }

  const daysLeft = Math.round((dayMs(payload.u) - dayMs(tashkentDay(now))) / DAY);
  const common = { ...info, daysLeft, paidUntil: payload.u, shopName: payload.n, pay: payInfo(payload) };
  if (!payload.a) {
    return { ...common, code: "blocked", message: "Kassa sotuvchi tomonidan to‘xtatilgan. Sotuvchingiz bilan bog‘laning." };
  }
  if (daysLeft > payload.w) return { ...common, code: "ok", message: `Obuna ${payload.u} gacha to‘langan.` };
  if (daysLeft >= 0) {
    return {
      ...common,
      code: "soon",
      message:
        daysLeft === 0
          ? "Obuna muddati bugun tugaydi. Iltimos, oylik to‘lovni amalga oshiring."
          : `Obuna muddati ${daysLeft} kundan keyin tugaydi (${payload.u}). Iltimos, oylik to‘lovni amalga oshiring.`,
    };
  }
  if (-daysLeft <= payload.g) {
    const rest = payload.g + daysLeft;
    return {
      ...common,
      code: "grace",
      message: `Obuna muddati tugadi. ${rest > 0 ? `${rest} kundan keyin` : "Ertadan boshlab"} yangi savdo to‘xtaydi. Iltimos, to‘lovni amalga oshiring.`,
    };
  }
  return {
    ...common,
    code: "blocked",
    message: "Obuna muddati tugagan, yangi savdo to‘xtatildi. Hisobotlar ochiq. To‘lovdan keyin kassa darhol ishlaydi.",
  };
}

export function assertLicensed() {
  const st = licenseStatus();
  if (st.code === "blocked") {
    const err = new Error(st.message);
    (err as Error & { status: number }).status = 402;
    throw err;
  }
}

export async function refreshLicense() {
  await refresh(true);
  return licenseStatus();
}

export function activateLicense(code: string) {
  const key = licenseKey();
  if (!key) throw new Error("Bu kassada obuna yoqilmagan");
  const payload = readToken(code, key);
  if (!payload) throw new Error("Faollashtirish kodi noto‘g‘ri yoki boshqa do‘konga tegishli");
  const current = getSettings().license_token;
  const existing = current ? readToken(current, key) : null;
  if (existing && Date.parse(existing.i) > Date.parse(payload.i)) throw new Error("Bu kod eskirgan, yangisini oling");
  saveSetting("license_token", code.trim());
  saveSetting("license_checked_at", new Date().toISOString());
  saveSetting("license_error", "");
  return licenseStatus();
}
