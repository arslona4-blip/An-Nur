import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { receiptLink } from "@/lib/phase7";

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await req.json();
    return NextResponse.json(await receiptLink(Number(body.saleId), String(body.origin || "")));
  } catch (e) {
    return jsonError(e);
  }
}
