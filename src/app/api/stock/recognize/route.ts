import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { recognizeInvoice } from "@/lib/invoice";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof File) || file.size === 0) throw new Error("Rasm yuklang");
    return NextResponse.json(await recognizeInvoice(file));
  } catch (e) {
    return jsonError(e);
  }
}
