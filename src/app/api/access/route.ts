import { NextResponse } from "next/server";
import { lanUrls } from "@/lib/lan";

export async function GET() {
  return NextResponse.json({ urls: lanUrls() });
}
