import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { assignBarcode, assignMissingBarcodes, nextStoreBarcode } from "@/lib/phase7";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ code: nextStoreBarcode() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.all) return NextResponse.json({ count: assignMissingBarcodes() });
    return NextResponse.json({ code: assignBarcode(Number(body.id)) });
  } catch (e) {
    return jsonError(e);
  }
}
