import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { createSale } from "@/lib/db";
import {
  enqueueOffline,
  listOfflineQueue,
  markOfflineFailed,
  markOfflineSynced,
} from "@/lib/phase4";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({ queue: listOfflineQueue() });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();

    if (body.action === "enqueue") {
      const id = enqueueOffline(body.kind || "sale", body.payload);
      return NextResponse.json({ id });
    }

    if (body.action === "sync") {
      const pending = listOfflineQueue();
      const results: Array<{ id: number; ok: boolean; error?: string }> = [];
      for (const item of pending) {
        try {
          const payload = JSON.parse(String(item.payload));
          if (item.kind === "sale") {
            createSale({ ...payload, userId: user.id });
          }
          markOfflineSynced(Number(item.id));
          results.push({ id: Number(item.id), ok: true });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Xatolik";
          markOfflineFailed(Number(item.id), msg);
          results.push({ id: Number(item.id), ok: false, error: msg });
        }
      }
      return NextResponse.json({ results, queue: listOfflineQueue() });
    }

    return jsonError(new Error("Noto'g'ri amal"));
  } catch (e) {
    return jsonError(e);
  }
}
