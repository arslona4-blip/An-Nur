import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import {
  createDiscountRule,
  deleteDiscountRule,
  listDiscountRules,
  previewDiscounts,
  updateDiscountRule,
} from "@/lib/phase2";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "preview") {
      const items = JSON.parse(url.searchParams.get("items") || "[]");
      return NextResponse.json({ preview: previewDiscounts(items) });
    }
    return NextResponse.json({ rules: listDiscountRules() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.action === "preview") {
      return NextResponse.json({ preview: previewDiscounts(body.items || []) });
    }
    return NextResponse.json({ rule: createDiscountRule(body) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({ rule: updateDiscountRule(Number(body.id), body) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new Error("ID kerak");
    deleteDiscountRule(Number(id));
    return NextResponse.json({ rules: listDiscountRules() });
  } catch (e) {
    return jsonError(e);
  }
}
