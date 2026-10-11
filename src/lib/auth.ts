import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "./db";

export type SessionUser = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "kassir";
};

const COOKIE = "hisob_session";

let cachedSecret: Uint8Array | null = null;

function secret() {
  if (cachedSecret) return cachedSecret;
  let value = process.env.HISOB_SECRET?.trim();
  if (!value) {
    const dir = process.env.ANNUR_DATA_DIR || path.join(process.cwd(), "data");
    const file = path.join(dir, ".session-secret");
    try {
      value = fs.readFileSync(file, "utf8").trim();
    } catch {
      value = "";
    }
    if (!value) {
      value = randomBytes(48).toString("hex");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, value, { mode: 0o600 });
    }
  }
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

export async function signSession(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function readSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const session = payload as unknown as SessionUser;
    const current = getDb()
      .prepare("SELECT id, username, name, role, active FROM users WHERE id = ?")
      .get(session.id) as (SessionUser & { active: number }) | undefined;
    if (!current || !current.active) return null;
    return { id: current.id, username: current.username, name: current.name, role: current.role };
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function requireUser() {
  const user = await readSession();
  if (!user) {
    const err = new Error("Kirish talab qilinadi");
    (err as Error & { status: number }).status = 401;
    throw err;
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    const err = new Error("Faqat administrator uchun");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  return user;
}

export function jsonError(error: unknown, fallback = 400) {
  const message = error instanceof Error ? error.message : "Xatolik";
  const status = (error as { status?: number })?.status || fallback;
  return NextResponse.json({ error: message }, { status });
}
