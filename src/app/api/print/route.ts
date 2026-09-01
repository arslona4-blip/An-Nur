import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { buildEscPosReceipt, saleToReceipt, sendNetworkPrint } from "@/lib/phase3";

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await req.json();
    const settings = getSettings();
    const width = Number(settings.printer_width || 58);

    let receipt;
    if (body.saleId) {
      receipt = saleToReceipt(Number(body.saleId));
    } else if (body.receipt) {
      receipt = body.receipt;
    } else {
      throw new Error("Chek ma'lumoti kerak");
    }

    const escpos = buildEscPosReceipt(receipt, width);

    if (body.action === "network") {
      await sendNetworkPrint(escpos);
      return NextResponse.json({ ok: true, mode: "network" });
    }

    return NextResponse.json({ ok: true, escpos, width });
  } catch (e) {
    return jsonError(e);
  }
}
