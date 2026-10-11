import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { receiveStatus, requireBotKey } from "@/lib/integration";

export async function POST(req: Request) {
  try {
    requireBotKey(req);
    return NextResponse.json({ order: receiveStatus(await req.json()) });
  } catch (e) {
    return jsonError(e);
  }
}
