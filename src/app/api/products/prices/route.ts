import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { type BulkPriceInput, bulkPriceApply, bulkPricePreview, listPriceHistory } from "@/lib/phase8";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const productId = Number(url.searchParams.get("productId")) || undefined;
    return NextResponse.json({ history: listPriceHistory({ productId, limit: Number(url.searchParams.get("limit")) || 100 }) });
  } catch (e) {
    return jsonError(e);
  }
}

function parseInput(body: Record<string, unknown>): BulkPriceInput {
  return {
    categoryId: Number(body.categoryId) || null,
    supplierId: Number(body.supplierId) || null,
    mode: String(body.mode) as BulkPriceInput["mode"],
    value: Number(body.value),
    round: Number(body.round) || 0,
    exclude: Array.isArray(body.exclude) ? body.exclude.map(Number).filter(Number.isFinite) : [],
  };
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    const input = parseInput(body);
    if (body.action === "apply") return NextResponse.json(bulkPriceApply(input, user.id));
    return NextResponse.json({ rows: bulkPricePreview(input) });
  } catch (e) {
    return jsonError(e);
  }
}
