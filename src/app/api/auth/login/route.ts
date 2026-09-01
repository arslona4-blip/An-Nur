import { NextResponse } from "next/server";
import { jsonError, setSessionCookie, signSession } from "@/lib/auth";
import { verifyLogin } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const user = verifyLogin(String(body.username || ""), String(body.password || ""));
    if (!user) return NextResponse.json({ error: "Login yoki parol noto'g'ri" }, { status: 401 });
    const token = await signSession({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    });
    return setSessionCookie(NextResponse.json({ user }), token);
  } catch (e) {
    return jsonError(e);
  }
}
