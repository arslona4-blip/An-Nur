import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { createUser, listUsers, updateUser } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ users: listUsers() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({
      users: createUser({
        username: String(body.username || ""),
        password: String(body.password || ""),
        name: String(body.name || ""),
        role: body.role === "kassir" ? "kassir" : "admin",
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    return NextResponse.json({
      users: updateUser(Number(body.id), {
        name: body.name,
        role: body.role,
        active: body.active,
        password: body.password,
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}
