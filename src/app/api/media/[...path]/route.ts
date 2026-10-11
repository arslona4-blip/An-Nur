import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { uploadsDir } from "@/lib/phase5";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    await requireUser();
    const parts = (await ctx.params).path || [];
    if (parts.length < 2 || parts[0] !== "products") {
      throw Object.assign(new Error("Topilmadi"), { status: 404 });
    }
    const fileName = parts[1];
    if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
      throw Object.assign(new Error("Noto‘g‘ri yo‘l"), { status: 400 });
    }
    const filePath = path.join(uploadsDir("products"), fileName);
    const root = uploadsDir("products");
    if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
      throw Object.assign(new Error("Rasm topilmadi"), { status: 404 });
    }
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(fileName).toLowerCase();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return jsonError(e, 404);
  }
}
