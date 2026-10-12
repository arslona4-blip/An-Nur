import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { tillEvents } from "@/lib/agentWrite";
import { requireAgentWriteKey } from "@/lib/integration";

export async function GET(req: Request) {
  try {
    requireAgentWriteKey(req);
    const after = new URL(req.url).searchParams.get("after");
    return NextResponse.json(tillEvents(after === null ? null : Number(after)));
  } catch (e) {
    return jsonError(e);
  }
}
