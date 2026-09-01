import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { exportProductsCsv, exportReportsCsv, exportSalesCsv, restoreBackup } from "@/lib/phase1";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "sales";
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;
    let csv = "";
    let filename = "hisob.csv";
    if (type === "products") {
      csv = exportProductsCsv();
      filename = "mahsulotlar.csv";
    } else if (type === "reports") {
      csv = exportReportsCsv(from, to);
      filename = `hisobot-${from || "all"}.csv`;
    } else {
      csv = exportSalesCsv(from, to);
      filename = `savdolar-${from || "all"}.csv`;
    }
    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    restoreBackup(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
