import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { addPayment, listPayments } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    return NextResponse.json({
      payments: listPayments(
        url.searchParams.get("kind") || undefined,
        url.searchParams.get("from") || undefined,
        url.searchParams.get("to") || undefined,
      ),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    addPayment({
      userId: user.id,
      kind: body.kind,
      amount: Number(body.amount),
      method: body.method || "naqd",
      category: body.category,
      note: body.note,
      partyId: body.partyId || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
