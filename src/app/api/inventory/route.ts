import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import {
  applyInventoryCount,
  createInventoryCount,
  getInventoryCount,
  listInventoryCounts,
  updateInventoryItem,
} from "@/lib/phase1";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const id = new URL(req.url).searchParams.get("id");
    if (id) return NextResponse.json({ count: getInventoryCount(Number(id)) });
    return NextResponse.json({ counts: listInventoryCounts() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAdmin();
    const body = await req.json();
    if (body.action === "create") {
      return NextResponse.json({ count: createInventoryCount(user.id, body.note) });
    }
    if (body.action === "update") {
      return NextResponse.json({
        count: updateInventoryItem(Number(body.countId), Number(body.productId), Number(body.actualQty)),
      });
    }
    if (body.action === "apply") {
      return NextResponse.json({ count: applyInventoryCount(Number(body.countId)) });
    }
    return jsonError(new Error("Noto'g'ri amal"));
  } catch (e) {
    return jsonError(e);
  }
}
