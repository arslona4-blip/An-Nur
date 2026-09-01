import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { listExpiringProducts } from "@/lib/phase2";

export async function GET(req: Request) {
  try {
    await requireUser();
    const days = new URL(req.url).searchParams.get("days");
    return NextResponse.json({
      products: listExpiringProducts(days ? Number(days) : undefined),
    });
  } catch (e) {
    return jsonError(e);
  }
}
