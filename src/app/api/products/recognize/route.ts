import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { listCategories } from "@/lib/db";
import { recognizeProductFromImage } from "@/lib/phase5";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Rasm yuklang");
    }
    const caption = String(form.get("caption") || "");
    const { products: recognized } = await recognizeProductFromImage(file, { caption });
    const categories = listCategories();
    const products = recognized.map((p) => {
      const category = p.category_name
        ? categories.find((c) => c.name.toLowerCase() === p.category_name!.toLowerCase())
        : null;
      return { ...p, category_id: category?.id ?? null };
    });
    return NextResponse.json({ products, product: products[0] });
  } catch (e) {
    return jsonError(e);
  }
}
