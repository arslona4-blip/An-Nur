import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { addPayment, createSupplier, listSuppliers, updateSupplier } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const q = new URL(req.url).searchParams.get("q") || undefined;
    return NextResponse.json({ suppliers: listSuppliers(q) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    if (body.action === "pay") {
      addPayment({
        userId: user.id,
        kind: "supplier",
        partyId: Number(body.id),
        amount: Number(body.amount),
        method: body.method || "naqd",
        note: body.note,
      });
      return NextResponse.json({ suppliers: listSuppliers() });
    }
    const supplier = createSupplier(body);
    return NextResponse.json({ supplier, suppliers: listSuppliers() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const supplier = updateSupplier(Number(body.id), body);
    return NextResponse.json({ supplier });
  } catch (e) {
    return jsonError(e);
  }
}
