import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { payCommission, sellerKpi } from "@/lib/phase6";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    return NextResponse.json({
      kpi: sellerKpi(url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    return NextResponse.json({
      kpi: payCommission({
        adminId: admin.id,
        userId: Number(body.userId),
        from: String(body.from || ""),
        to: String(body.to || ""),
        method: typeof body.method === "string" ? body.method : undefined,
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}
