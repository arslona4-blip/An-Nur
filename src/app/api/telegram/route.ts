import { NextResponse } from "next/server";
import { productPrefix } from "@/lib/brand";
import { jsonError, requireAdmin } from "@/lib/auth";
import { buildAlertMessage, sendTelegram, sendTelegramAlertsIfEnabled } from "@/lib/phase2";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ preview: buildAlertMessage() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.action === "test") {
      await sendTelegram(body.text || `${productPrefix("test xabari")} ✓`);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "alerts") {
      const result = await sendTelegramAlertsIfEnabled();
      return NextResponse.json(result);
    }
    return jsonError(new Error("Noto'g'ri amal"));
  } catch (e) {
    return jsonError(e);
  }
}
