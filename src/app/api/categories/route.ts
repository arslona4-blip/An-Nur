import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { createCategory, deleteCategory, listCategories, renameCategory } from "@/lib/db";

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

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({ categories: renameCategory(Number(body.id), String(body.name || "")) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    const move = url.searchParams.get("moveTo");
    const moveTo = move === null ? undefined : Number(move) > 0 ? Number(move) : null;
    return NextResponse.json({ categories: deleteCategory(id, moveTo) });
  } catch (e) {
    return jsonError(e);
  }
}
