import fs from "node:fs";
import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { resetStoreData } from "@/lib/db";
import { uploadsDir } from "@/lib/phase5";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "TOZALASH") throw new Error("Tasdiqlash uchun TOZALASH deb yozing");
    resetStoreData();
    fs.rmSync(uploadsDir("products"), { recursive: true, force: true });
    fs.mkdirSync(uploadsDir("products"), { recursive: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
