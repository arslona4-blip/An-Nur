import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { createProduct, listProducts, updateProduct } from "@/lib/db";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || undefined;
    const categoryId = url.searchParams.get("categoryId");
    const includeInactive = url.searchParams.get("all") === "1";
    return NextResponse.json({
      products: listProducts({
        q,
        categoryId: categoryId ? Number(categoryId) : undefined,
        includeInactive,
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const product = createProduct(body);
    return NextResponse.json({ product });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const product = updateProduct(Number(body.id), body);
    return NextResponse.json({ product });
  } catch (e) {
    return jsonError(e);
  }
}
