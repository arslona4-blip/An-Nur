import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { handleTelegramUpdate } from "@/lib/telegram-bot";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const settings = getSettings();
    if (settings.telegram_bot_enabled !== "1") {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const secret = settings.telegram_webhook_secret?.trim();
    if (secret) {
      const header = req.headers.get("x-telegram-bot-api-secret-token");
      if (header !== secret) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const update = await req.json();
    const result = await handleTelegramUpdate(update);
    return NextResponse.json(result || { ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: true });
  }
}
