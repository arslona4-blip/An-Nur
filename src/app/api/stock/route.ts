import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { createStockIn, listStockIns } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ stockIns: listStockIns() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    return NextResponse.json({
      stockIns: createStockIn({
        userId: user.id,
        supplierId: body.supplierId || null,
        paid: body.paid || 0,
        note: body.note,
        items: body.items || [],
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}
