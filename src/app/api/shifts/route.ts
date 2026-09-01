import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import {
  closeShift,
  createReturn,
  findSaleByNumber,
  getOpenShift,
  getReturn,
  listReturns,
  listShifts,
  openShift,
} from "@/lib/phase1";
import { getShiftReport, shiftReportText } from "@/lib/phase2";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    if (action === "sale") {
      const number = url.searchParams.get("number");
      if (!number) throw new Error("Chek raqami kerak");
      const sale = findSaleByNumber(number);
      return NextResponse.json({ sale });
    }
    if (action === "return") {
      const id = url.searchParams.get("id");
      if (id) return NextResponse.json({ ret: getReturn(Number(id)) });
    }
    if (action === "report") {
      const id = url.searchParams.get("id");
      if (!id) throw new Error("Smena ID kerak");
      const report = getShiftReport(Number(id));
      return NextResponse.json({ report, text: shiftReportText(Number(id)) });
    }
    const shift = getOpenShift(user.role === "kassir" ? user.id : undefined);
    return NextResponse.json({
      shift,
      shifts: listShifts(),
      returns: listReturns(url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (body.action === "open") {
      return NextResponse.json({ shift: openShift(user.id, Number(body.openingCash || 0)) });
    }
    if (body.action === "close") {
      return NextResponse.json({ shift: closeShift(user.id, Number(body.closingCash || 0), body.note) });
    }
    if (body.action === "return") {
      return NextResponse.json({
        ret: createReturn({
          userId: user.id,
          saleId: Number(body.saleId),
          refundMethod: body.refundMethod || "naqd",
          note: body.note,
          items: body.items || [],
        }),
      });
    }
    return jsonError(new Error("Noto'g'ri amal"));
  } catch (e) {
    return jsonError(e);
  }
}
