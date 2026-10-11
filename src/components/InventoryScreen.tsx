"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/client";
import { qty, tashkentDateTime } from "@/lib/format";

type CountItem = {
  product_id: number;
  name: string;
  unit: string;
  system_qty: number;
  actual_qty: number;
  diff: number;
};

type Count = {
  id: number;
  number: string;
  status: string;
  user_name: string;
  created_at: string;
  applied_at?: string;
  items: CountItem[];
};

export function InventoryScreen() {
  const [counts, setCounts] = useState<Count[]>([]);
  const [active, setActive] = useState<Count | null>(null);
  const drafts = useRef(new Map<number, number>());
  const [filter, setFilter] = useState("");
  const activeId = active?.id;
  useEffect(() => {
    drafts.current.clear();
  }, [activeId]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await api<{ counts: Count[] }>("/api/inventory");
    setCounts(d.counts);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function createCount() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ count: Count }>("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ action: "create", note }),
      });
      setActive(d.count);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function openCount(id: number) {
    const d = await api<{ count: Count }>(`/api/inventory?id=${id}`);
    setActive(d.count);
  }

  async function updateItem(productId: number, actualQty: number) {
    if (!active) return;
    const d = await api<{ count: Count }>("/api/inventory", {
      method: "POST",
      body: JSON.stringify({ action: "update", countId: active.id, productId, actualQty }),
    });
    if (drafts.current.get(productId) === actualQty) drafts.current.delete(productId);
    setActive(d.count);
  }

  async function applyCount() {
    if (!active) return;
    if (!confirm("Farqlarni omborga qo'llashni tasdiqlaysizmi?")) return;
    setBusy(true);
    try {
      for (const [productId, actualQty] of [...drafts.current]) {
        await updateItem(productId, actualQty);
      }
      const d = await api<{ count: Count }>("/api/inventory", {
        method: "POST",
        body: JSON.stringify({ action: "apply", countId: active.id }),
      });
      setActive(d.count);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  const items = active?.items.filter((i) => !filter || i.name.toLowerCase().includes(filter.toLowerCase())) || [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Inventarizatsiya</h1>
        <p className="text-sm text-muted">Ombordagi haqiqiy qoldiqni tekshirish</p>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}

      {!active ? (
        <Card className="space-y-3 p-4">
          <Field label="Izoh (ixtiyoriy)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button disabled={busy} onClick={createCount}>
            {busy ? "Yaratilmoqda..." : "Yangi inventar boshlash"}
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-bold">{active.number}</div>
              <div className="text-sm text-muted">
                {tashkentDateTime(active.created_at)} · {active.status === "draft" ? "Qoralama" : "Qo'llangan"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setActive(null)}>
                Orqaga
              </Button>
              {active.status === "draft" ? (
                <Button disabled={busy} onClick={applyCount}>
                  Qo'llash
                </Button>
              ) : null}
            </div>
          </div>
          <Input placeholder="Mahsulot qidirish..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="max-h-[60vh] space-y-1 overflow-y-auto">
            {items.map((it) => (
              <div key={it.product_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{it.name}</div>
                  <div className="text-xs text-muted">Tizim: {qty(it.system_qty, it.unit)}</div>
                </div>
                <Input
                  type="number"
                  step="0.001"
                  className="w-28"
                  aria-label={it.name}
                  disabled={active.status !== "draft"}
                  defaultValue={it.actual_qty}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (e.target.value !== "" && Number.isFinite(v) && v !== it.actual_qty) drafts.current.set(it.product_id, v);
                    else drafts.current.delete(it.product_id);
                  }}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v !== it.actual_qty) updateItem(it.product_id, v).catch((err) => setError(err.message));
                  }}
                />
                {Math.abs(it.diff) > 0.0001 ? (
                  <span className={`text-xs font-semibold ${it.diff > 0 ? "text-ok" : "text-danger"}`}>
                    {it.diff > 0 ? "+" : ""}
                    {qty(it.diff, it.unit)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <div className="px-4 py-3 font-bold">Inventarlar tarixi</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Raqam</th>
              <th className="px-4 py-2 font-medium">Sana</th>
              <th className="px-4 py-2 font-medium">Holat</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {counts.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-2">{c.number}</td>
                <td className="px-4 py-2">{tashkentDateTime(c.created_at)}</td>
                <td className="px-4 py-2">{c.status === "draft" ? "Qoralama" : "Qo'llangan"}</td>
                <td className="px-4 py-2">
                  <button className="text-brand" onClick={() => openCount(c.id)}>
                    Ochish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
