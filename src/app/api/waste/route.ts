import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { createWaste, listWaste, WASTE_REASONS } from "@/lib/phase1";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    return NextResponse.json({
      reasons: WASTE_REASONS,
      waste: listWaste(url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    return NextResponse.json({
      waste: createWaste({
        userId: user.id,
        productId: Number(body.productId),
        qty: Number(body.qty),
        reason: String(body.reason || "Boshqa"),
        note: body.note,
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}
