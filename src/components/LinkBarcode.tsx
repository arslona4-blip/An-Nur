"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { api } from "@/lib/client";
import { STORE_BARCODE_PREFIX } from "@/lib/ean13";

type Found = { id: number; name: string; barcode: string | null };

// Products added by list/photo got an internal "29..." code; the factory code from the pack replaces it.
export function LinkBarcode<T extends Found>({
  barcode,
  onLinked,
  autoFocus = true,
}: {
  barcode: string;
  onLinked: (product: T) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function search(text: string) {
    setQ(text);
    const t = text.trim();
    if (t.length < 2) {
      setList([]);
      return;
    }
    api<{ products: T[] }>(`/api/products?q=${encodeURIComponent(t)}`)
      .then((r) => setList(r.products.slice(0, 8)))
      .catch(() => {});
  }

  async function link(p: T) {
    setError("");
    setBusy(true);
    try {
      const { product } = await api<{ product: T }>("/api/products", {
        method: "PUT",
        body: JSON.stringify({ id: p.id, barcode }),
      });
      onLinked(product);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="text-sm font-semibold">Bu mahsulot bazada bormi? Toping va biriktiring</div>
      <Input autoFocus={autoFocus} value={q} placeholder="Nomini yozing: kola, shakar..." onChange={(e) => search(e.target.value)} />
      {list.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={busy}
          onClick={() => link(p)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left text-sm! hover:bg-bg"
        >
          <span className="min-w-0 truncate font-semibold">{p.name}</span>
          <span className="shrink-0 text-xs text-muted">
            {p.barcode && !p.barcode.startsWith(STORE_BARCODE_PREFIX) ? `kodi bor: ${p.barcode}` : "biriktirish"}
          </span>
        </button>
      ))}
      {q.trim().length >= 2 && !list.length ? <div className="text-xs text-muted">Topilmadi — pastda yangi mahsulot qo‘shing</div> : null}
      {error ? <div className="text-sm text-danger">{error}</div> : null}
    </div>
  );
}
