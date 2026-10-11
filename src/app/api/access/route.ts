import { NextResponse } from "next/server";
import { lanUrls } from "@/lib/lan";

export async function GET() {
  if (process.env.RAILWAY_ENVIRONMENT) return NextResponse.json({ urls: [] });
  return NextResponse.json({ urls: lanUrls() });
}
