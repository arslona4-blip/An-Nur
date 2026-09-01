import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { getFiscalQr } from "@/lib/phase4";

export async function GET(req: Request) {
  try {
    await requireUser();
    const saleId = new URL(req.url).searchParams.get("saleId");
    if (!saleId) throw new Error("saleId kerak");
    return NextResponse.json(getFiscalQr(Number(saleId)));
  } catch (e) {
    return jsonError(e);
  }
}
