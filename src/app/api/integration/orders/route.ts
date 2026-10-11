import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { receiveOrder, requireBotKey } from "@/lib/integration";

export async function POST(req: Request) {
  try {
    requireBotKey(req);
    return NextResponse.json({ order: receiveOrder(await req.json()) });
  } catch (e) {
    return jsonError(e);
  }
}
