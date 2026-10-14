import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/auth";
import { transcribeAudio } from "@/lib/phase5";

export const runtime = "nodejs";

const MAX_AUDIO = 15 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File) || file.size === 0) throw new Error("Ovoz yozilmadi");
    if (file.size > MAX_AUDIO) throw new Error("Ovoz juda uzun — bo‘lib-bo‘lib ayting");
    return NextResponse.json({ text: await transcribeAudio(file) });
  } catch (e) {
    return jsonError(e);
  }
}
