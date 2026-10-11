import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { createSale, getSale, listSales } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) return NextResponse.json({ sale: getSale(Number(id)) });
    return NextResponse.json({
      sales: listSales(url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const sale = createSale({
      userId: user.id,
      customerId: body.customerId || null,
      paymentMethod: String(body.paymentMethod || "naqd"),
      discount: body.discount || 0,
      paid: body.paid,
      foreignPaid: body.foreignPaid,
      note: body.note,
      items: body.items || [],
      clientId: body.clientId ? String(body.clientId) : null,
      soldAt: body.soldAt ? String(body.soldAt) : null,
    });
    return NextResponse.json({ sale });
  } catch (e) {
    return jsonError(e);
  }
}
