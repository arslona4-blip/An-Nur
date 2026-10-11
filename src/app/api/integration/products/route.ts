import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { catalog, requireBotKey } from "@/lib/integration";

export async function GET(req: Request) {
  try {
    requireBotKey(req);
    return NextResponse.json(catalog());
  } catch (e) {
    return jsonError(e);
  }
}
