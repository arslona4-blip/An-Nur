import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/db";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(getDashboard());
  } catch (e) {
    return jsonError(e);
  }
}
