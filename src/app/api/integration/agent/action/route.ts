import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { agentAction } from "@/lib/agentWrite";
import { requireAgentWriteKey } from "@/lib/integration";

export async function POST(req: Request) {
  try {
    requireAgentWriteKey(req);
    return NextResponse.json(agentAction(await req.json()));
  } catch (e) {
    return jsonError(e);
  }
}
