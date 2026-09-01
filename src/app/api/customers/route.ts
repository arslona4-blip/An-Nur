import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { addPayment, createCustomer, listCustomers, updateCustomer } from "@/lib/db";
import { getCustomerHistory } from "@/lib/phase2";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id && url.searchParams.get("action") === "history") {
      return NextResponse.json(getCustomerHistory(Number(id)));
    }
    const q = url.searchParams.get("q") || undefined;
    return NextResponse.json({ customers: listCustomers(q) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (body.action === "pay") {
      addPayment({
        userId: user.id,
        kind: "customer",
        partyId: Number(body.id),
        amount: Number(body.amount),
        method: body.method || "naqd",
        note: body.note,
      });
      return NextResponse.json({ customers: listCustomers() });
    }
    const customer = createCustomer(body);
    return NextResponse.json({ customer, customers: listCustomers() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireUser();
    const body = await req.json();
    const customer = updateCustomer(Number(body.id), body);
    return NextResponse.json({ customer });
  } catch (e) {
    return jsonError(e);
  }
}
