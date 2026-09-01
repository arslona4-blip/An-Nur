import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export type SessionUser = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "kassir";
};

const COOKIE = "hisob_session";

function secret() {
  return new TextEncoder().encode(
    process.env.HISOB_SECRET || "hisob-local-dev-secret-change-me",
  );
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
    return payload as unknown as SessionUser;
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
