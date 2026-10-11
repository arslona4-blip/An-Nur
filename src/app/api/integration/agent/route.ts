import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { agentSnapshot, requireAgentKey } from "@/lib/integration";

export async function GET(req: Request) {
  try {
    requireAgentKey(req);
    return NextResponse.json(agentSnapshot());
  } catch (e) {
    return jsonError(e);
  }
}
