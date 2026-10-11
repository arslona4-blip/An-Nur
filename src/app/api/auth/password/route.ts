import { NextResponse } from "next/server";
import { jsonError, readSession } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const user = await readSession();
    if (!user) return NextResponse.json({ error: "Kirish talab qilinadi" }, { status: 401 });
    const body = await req.json();
    changeOwnPassword(user.id, String(body.current || ""), String(body.next || ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
