import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { exportBackup, getSettings, setSettings } from "@/lib/db";

const ADMIN_ONLY = /token|secret|password|api_key|sms_email|telegram_(admin|courier)_ids|telegram_chat_id/;

export async function GET() {
  try {
    const user = await requireUser();
    const settings = getSettings();
    if (user.role !== "admin") {
      for (const key of Object.keys(settings)) if (ADMIN_ONLY.test(key)) delete settings[key];
    }
    return NextResponse.json({ settings });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({ settings: setSettings(body) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST() {
  try {
    await requireAdmin();
    return NextResponse.json(exportBackup());
  } catch (e) {
    return jsonError(e);
  }
}
