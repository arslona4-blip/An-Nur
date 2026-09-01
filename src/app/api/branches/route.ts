import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import {
  createBranch,
  getCurrentBranch,
  listBranches,
  setCurrentBranch,
  updateBranch,
} from "@/lib/phase4";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ branches: listBranches(), current: getCurrentBranch() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.action === "switch") {
      return NextResponse.json({ current: setCurrentBranch(Number(body.id)) });
    }
    return NextResponse.json({ branch: createBranch(body) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({ branch: updateBranch(Number(body.id), body) });
  } catch (e) {
    return jsonError(e);
  }
}
