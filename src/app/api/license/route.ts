import { NextResponse } from "next/server";
import { jsonError, requireAdmin, requireUser } from "@/lib/auth";
import { activateLicense, licenseStatus, refreshLicense } from "@/lib/license";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ license: licenseStatus() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    if (body.action === "refresh") return NextResponse.json({ license: await refreshLicense() });
    if (body.action === "activate") return NextResponse.json({ license: activateLicense(String(body.code || "")) });
    return jsonError(new Error("Noto'g'ri amal"));
  } catch (e) {
    return jsonError(e);
  }
}
