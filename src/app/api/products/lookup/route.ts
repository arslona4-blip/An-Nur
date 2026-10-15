import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { lookupBarcodeName } from "@/lib/barcodeLookup";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const code = new URL(req.url).searchParams.get("code") || "";
    return NextResponse.json({ name: await lookupBarcodeName(code) });
  } catch (e) {
    return jsonError(e);
  }
}
