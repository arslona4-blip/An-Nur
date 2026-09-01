import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { createCategory, deleteCategory, listCategories } from "@/lib/db";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ categories: listCategories() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({ categories: createCategory(String(body.name || ""), body.color) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const id = Number(new URL(req.url).searchParams.get("id"));
    return NextResponse.json({ categories: deleteCategory(id) });
  } catch (e) {
    return jsonError(e);
  }
}
