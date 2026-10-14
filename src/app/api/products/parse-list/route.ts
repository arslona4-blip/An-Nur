import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { listCategories } from "@/lib/db";
import { parseProductList } from "@/lib/phase5";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const { products: listed } = await parseProductList(String(body.text || ""));
    const categories = listCategories();
    const products = listed.map((p) => {
      const category = p.category_name ? categories.find((c) => c.name.toLowerCase() === p.category_name!.toLowerCase()) : null;
      return { ...p, category_id: category?.id ?? null };
    });
    return NextResponse.json({ products });
  } catch (e) {
    return jsonError(e);
  }
}
