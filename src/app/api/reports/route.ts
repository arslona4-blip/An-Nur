import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { getReports } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    return NextResponse.json(
      getReports(url.searchParams.get("from") || undefined, url.searchParams.get("to") || undefined),
    );
  } catch (e) {
    return jsonError(e);
  }
}
