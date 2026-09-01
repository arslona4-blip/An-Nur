"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { readQueue, syncOfflineQueue } from "@/lib/offline";

export function OfflineBanner() {
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  function refresh() {
    setPending(readQueue().length);
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  async function sync() {
    setBusy(true);
    setMsg("");
    try {
      const results = await syncOfflineQueue();
      const ok = results.filter((r) => r.ok).length;
      setMsg(`${ok} ta savdo sinxronlandi`);
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  if (pending === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div>
        {pending} ta offline savdo navbatda
        {msg ? <span className="ml-2 text-xs">({msg})</span> : null}
      </div>
      <Button variant="ghost" disabled={busy} onClick={sync}>
        {busy ? "Sinxron..." : "Sinxronlash"}
      </Button>
    </div>
  );
}
