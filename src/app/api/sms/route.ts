import { NextResponse } from "next/server";
import { productPrefix } from "@/lib/brand";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { listSmsLog, sendSms, smsDebtReminder, smsSaleThanks } from "@/lib/phase4";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ log: listSmsLog() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await req.json();
    if (body.action === "test") {
      await sendSms(body.phone, body.message || productPrefix("test SMS"));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "debt") {
      const msg = smsDebtReminder(body.name, Number(body.debt));
      await sendSms(body.phone, msg);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "sale") {
      const msg = smsSaleThanks(body.name, Number(body.total), body.number);
      await sendSms(body.phone, msg);
      return NextResponse.json({ ok: true });
    }
    await sendSms(body.phone, body.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
