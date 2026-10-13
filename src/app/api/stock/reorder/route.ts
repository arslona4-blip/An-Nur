import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { reorderSuggestions } from "@/lib/phase8";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ groups: reorderSuggestions() });
  } catch (e) {
    return jsonError(e);
  }
}
