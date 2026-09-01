import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { exportBackup, getSettings, setSettings } from "@/lib/db";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ settings: getSettings() });
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
