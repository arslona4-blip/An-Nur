"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { som, tashkentDateTime } from "@/lib/format";

type Row = { id: number; name: string; unit: string; buy_price: number; old_price: number; new_price: number; below_cost: boolean };
type History = {
  id: number;
  name: string;
  old_buy: number;
  new_buy: number;
  old_sell: number;
  new_sell: number;
  source: string;
  user_name: string | null;
  created_at: string;
};

const MODES = [
  { id: "pct", label: "Sotish narxini foizga o‘zgartirish", hint: "Masalan 10 — 10% qimmat, -5 — 5% arzon" },
  { id: "markup", label: "Tannarxga ustama (%)", hint: "Masalan 25 — sotish narxi = tannarx + 25%" },
  { id: "sum", label: "So‘mga qo‘shish / ayirish", hint: "Masalan 500 yoki -1000" },
];

const SOURCES: Record<string, string> = { tahrir: "Qo‘lda", kirim: "Kirim", ommaviy: "Ommaviy" };

function pct(a: number, b: number) {
  if (!a) return "";
  const d = ((b - a) / a) * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
}

export function PricesScreen() {
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: number; name: string }>>([]);
  const [form, setForm] = useState({ categoryId: "0", supplierId: "0", mode: "pct", value: "", round: "100" });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skip, setSkip] = useState<Record<number, boolean>>({});
  const [history, setHistory] = useState<History[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function loadHistory() {
    const h = await api<{ history: History[] }>("/api/products/prices?limit=150");
    setHistory(h.history);
  }

  useEffect(() => {
    Promise.all([
      api<{ categories: Array<{ id: number; name: string }> }>("/api/categories"),
      api<{ suppliers: Array<{ id: number; name: string }> }>("/api/suppliers"),
      loadHistory(),
    ])
      .then(([c, s]) => {
        setCategories(c.categories);
        setSuppliers(s.suppliers);
      })
      .catch((e) => setError(e.message));
  }, []);

  const body = (action: string) =>
    JSON.stringify({
      action,
      categoryId: Number(form.categoryId),
      supplierId: Number(form.supplierId),
      mode: form.mode,
      value: Number(form.value),
      round: Number(form.round),
      exclude: Object.keys(skip).filter((k) => skip[Number(k)]).map(Number),
    });

  async function preview() {
    setError("");
    setMsg("");
    setSkip({});
    try {
      const d = await api<{ rows: Row[] }>("/api/products/prices", {
        method: "POST",
        body: JSON.stringify({ ...JSON.parse(body("preview")), exclude: [] }),
      });
      setRows(d.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  const chosen = (rows || []).filter((r) => !skip[r.id]);

  async function apply() {
    if (!chosen.length) return;
    if (!confirm(`${chosen.length} ta mahsulotning sotish narxi o‘zgaradi. Davom etasizmi?`)) return;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ changed: number }>("/api/products/prices", { method: "POST", body: body("apply") });
      setMsg(`${d.changed} ta mahsulot narxi yangilandi`);
      setRows(null);
      setSkip({});
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  const mode = MODES.find((m) => m.id === form.mode) || MODES[0];
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setRows(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Narxlar</h1>
        <p className="text-sm text-muted">Bir nechta mahsulot narxini birdaniga o‘zgartirish va narx o‘zgarishlari tarixi</p>
      </div>
      <Card className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Toifa">
            <Select value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="0">Barcha toifalar</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ta’minotchi (oxirgi kirim bo‘yicha)">
            <Select value={form.supplierId} onChange={(e) => set({ supplierId: e.target.value })}>
              <option value="0">Barcha ta’minotchilar</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Usul">
            <Select value={form.mode} onChange={(e) => set({ mode: e.target.value })}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={form.mode === "sum" ? "So‘m" : "Foiz"}>
              <Input type="number" value={form.value} onChange={(e) => set({ value: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Yaxlitlash">
              <Select value={form.round} onChange={(e) => set({ round: e.target.value })}>
                <option value="0">Yo‘q</option>
                <option value="50">50 so‘m</option>
                <option value="100">100 so‘m</option>
                <option value="500">500 so‘m</option>
                <option value="1000">1 000 so‘m</option>
              </Select>
            </Field>
          </div>
        </div>
        <p className="text-xs text-muted">{mode.hint}</p>
        <Button onClick={preview} disabled={form.value.trim() === ""}>
          Oldindan ko‘rish
        </Button>
        {error ? <div className="text-sm text-danger">{error}</div> : null}
        {msg ? <div className="text-sm text-ok">{msg}</div> : null}
      </Card>

      {rows ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg px-4 py-3">
            <div className="text-sm">
              {rows.length ? (
                <>
                  <b>{chosen.length}</b> ta mahsulot narxi o‘zgaradi
                  {chosen.some((r) => r.below_cost) ? (
                    <span className="ml-2 text-danger">· {chosen.filter((r) => r.below_cost).length} tasi tannarxdan arzon!</span>
                  ) : null}
                </>
              ) : (
                "Hech qaysi mahsulot narxi o‘zgarmaydi"
              )}
            </div>
            <Button onClick={apply} disabled={busy || !chosen.length}>
              {busy ? "Saqlanmoqda..." : "Narxlarni o‘zgartirish"}
            </Button>
          </div>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-paper text-xs text-muted">
                <tr>
                  <th className="w-8 px-4 py-2"></th>
                  <th className="px-4 py-2 font-medium">Mahsulot</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Tannarx</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Hozir</th>
                  <th className="whitespace-nowrap px-4 py-2 text-right font-medium">Yangi</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-line ${skip[r.id] ? "text-muted" : ""}`}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={!skip[r.id]}
                        onChange={(e) => setSkip({ ...skip, [r.id]: !e.target.checked })}
                        aria-label={r.name}
                      />
                    </td>
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right num text-muted">{r.buy_price ? som(r.buy_price) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right num">{som(r.old_price)}</td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right font-semibold num ${r.below_cost ? "text-danger" : "text-brand"}`}>
                      {som(r.new_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-muted num">{pct(r.old_price, r.new_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-line bg-bg px-4 py-3 font-bold">Narx o‘zgarishlari tarixi</div>
        {history.length === 0 ? <div className="p-4 text-sm text-muted">Hali o‘zgarish yo‘q</div> : null}
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-line first:border-0">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{tashkentDateTime(h.created_at)}</td>
                  <td className="px-4 py-2 font-medium">{h.name}</td>
                  <td className="whitespace-nowrap px-4 py-2 num">
                    {h.old_sell !== h.new_sell ? (
                      <>
                        {som(h.old_sell)} → <b className={h.new_sell > h.old_sell ? "text-danger" : "text-ok"}>{som(h.new_sell)}</b>
                      </>
                    ) : (
                      <span className="text-muted">sotish o‘zgarmagan</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted num">
                    {h.old_buy !== h.new_buy ? `tannarx ${som(h.old_buy)} → ${som(h.new_buy)}` : ""}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">
                    {SOURCES[h.source] || h.source}
                    {h.user_name ? ` · ${h.user_name}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
