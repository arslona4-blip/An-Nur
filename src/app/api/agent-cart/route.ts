import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { takeAgentCart } from "@/lib/agentWrite";

export async function POST() {
  try {
    await requireUser();
    return NextResponse.json({ lines: takeAgentCart() });
  } catch (e) {
    return jsonError(e);
  }
}
