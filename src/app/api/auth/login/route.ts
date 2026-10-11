import { NextResponse } from "next/server";
import { jsonError, setSessionCookie, signSession } from "@/lib/auth";
import { verifyLogin } from "@/lib/db";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, { count: number; first: number }>();

function attemptKey(req: Request, username: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return `${ip}|${username.trim().toLowerCase()}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = String(body.username || "");
    const password = String(body.password || "");
    const key = attemptKey(req, username);
    const now = Date.now();
    const record = fails.get(key);
    if (record && now - record.first > WINDOW_MS) fails.delete(key);
    const current = fails.get(key);
    if (current && current.count >= MAX_FAILS) {
      const minutes = Math.ceil((WINDOW_MS - (now - current.first)) / 60000);
      return NextResponse.json(
        { error: `Ko'p marta noto'g'ri parol kiritildi. ${minutes} daqiqadan keyin urinib ko'ring` },
        { status: 429 },
      );
    }

    const user = verifyLogin(username, password);
    if (!user) {
      fails.set(key, { count: (current?.count || 0) + 1, first: current?.first || now });
      return NextResponse.json({ error: "Login yoki parol noto'g'ri" }, { status: 401 });
    }
    fails.delete(key);
    const token = await signSession({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    });
    const mustChangePassword = user.must_change_password === 1;
    return setSessionCookie(
      NextResponse.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role }, mustChangePassword }),
      token,
    );
  } catch (e) {
    return jsonError(e);
  }
}
