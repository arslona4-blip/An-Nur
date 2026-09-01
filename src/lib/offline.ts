"use client";

const KEY = "hisob_offline_sales";

export type OfflineSale = {
  id: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export function queueOfflineSale(payload: Record<string, unknown>) {
  const list = readQueue();
  const item: OfflineSale = {
    id: `off-${Date.now()}`,
    createdAt: new Date().toISOString(),
    payload,
  };
  list.push(item);
  localStorage.setItem(KEY, JSON.stringify(list));
  return item;
}

export function readQueue(): OfflineSale[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as OfflineSale[];
  } catch {
    return [];
  }
}

export function clearOfflineSale(id: string) {
  const list = readQueue().filter((x) => x.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function clearAllOffline() {
  localStorage.removeItem(KEY);
}

export async function syncOfflineQueue() {
  const list = readQueue();
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const item of list) {
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Sync xatolik");
      }
      clearOfflineSale(item.id);
      results.push({ id: item.id, ok: true });
    } catch (e) {
      results.push({ id: item.id, ok: false, error: e instanceof Error ? e.message : "Xatolik" });
    }
  }
  return results;
}
