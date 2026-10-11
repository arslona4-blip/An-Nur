import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { importProducts } from "@/lib/productImport";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({ result: importProducts(body.rows, Boolean(body.updateStock)) });
  } catch (e) {
    return jsonError(e);
  }
}
