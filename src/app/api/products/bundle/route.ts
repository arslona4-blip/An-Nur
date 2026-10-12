import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { bundleParts, setBundle } from "@/lib/phase6";

export async function GET(req: Request) {
  try {
    await requireUser();
    const id = Number(new URL(req.url).searchParams.get("id"));
    return NextResponse.json({ parts: bundleParts(id) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parts = Array.isArray(body.parts)
      ? body.parts.map((p: { product_id: unknown; qty: unknown }) => ({ product_id: Number(p.product_id), qty: Number(p.qty) }))
      : [];
    return NextResponse.json({ parts: setBundle(Number(body.id), parts) });
  } catch (e) {
    return jsonError(e);
  }
}
