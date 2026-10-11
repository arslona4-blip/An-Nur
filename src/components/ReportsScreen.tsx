"use client";

import { useEffect, useState } from "react";
import { Card, Input } from "@/components/ui";
import { api } from "@/lib/client";
import { methodLabel, som, tashkentDate } from "@/lib/format";

type Report = {
  from: string;
  to: string;
  sales: number;
  count: number;
  deliveries: number;
  deliveryCount: number;
  returns: number;
  returnCount: number;
  waste: number;
  revenue: number;
  cogs: number;
  gross: number;
  expenses: number;
  income: number;
  net: number;
  cash: number;
  debts: number;
  payables: number;
  abc: Array<{ name: string; qty: number; revenue: number; profit: number; class: string }>;
  byCashier: Array<{ name: string; t: number; c: number }>;
  byMethod: Array<{ payment_method: string; t: number; c: number }>;
  expenseRows: Array<{ category: string; s: number }>;
};

export function ReportsScreen() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function load(f = from, t = to) {
    setData(await api<Report>(`/api/reports?from=${f}&to=${t}`));
  }

  useEffect(() => {
    const end = tashkentDate();
    const start = tashkentDate(new Date(Date.now() - 6 * 86400000));
    setFrom(start);
    setTo(end);
    load(start, end).catch((e) => setError(e.message));
  }, []);

  const cards = data
    ? [
        {
          label: "Savdo",
          value: som(data.revenue),
          sub: [
            `${data.count} ta chek`,
            data.deliveryCount ? `${data.deliveryCount} ta yetkazish` : "",
            data.returnCount ? `qaytarish −${som(data.returns)}` : "",
          ]
            .filter(Boolean)
            .join(" · "),
        },
        { label: "Tannarx", value: som(data.cogs), sub: "sotilgan tovar" },
        { label: "Yalpi foyda", value: som(data.gross), sub: "savdo − tannarx" },
        {
          label: "Sof foyda",
          value: som(data.net),
          sub: data.waste ? `yalpi − xarajat − yo‘qotish (${som(data.waste)})` : "yalpi − xarajat",
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Hisobotlar</h1>
          <p className="text-sm text-muted">Foyda, ABC tahlil va kassir kesimi</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={from} suppressHydrationWarning onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} suppressHydrationWarning onChange={(e) => setTo(e.target.value)} />
          <button
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
            onClick={() => load(from, to).catch((e) => setError(e.message))}
          >
            Ko‘rsatish
          </button>
          <a
            href={`/api/export?type=sales&from=${from}&to=${to}`}
            className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-bg"
          >
            Savdo CSV
          </a>
          <a href="/api/export?type=products" className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-bg">
            Mahsulot CSV
          </a>
          <a
            href={`/api/export?type=reports&from=${from}&to=${to}`}
            className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold hover:bg-bg"
          >
            Hisobot CSV
          </a>
        </div>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.label} className="p-4">
                <div className="text-xs uppercase text-muted">{c.label}</div>
                <div className="mt-1 text-2xl font-extrabold num">{c.value}</div>
                <div className="text-xs text-muted">{c.sub}</div>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 font-bold">To‘lov usuli</div>
              {data.byMethod.map((m) => (
                <div key={m.payment_method} className="flex justify-between py-1 text-sm">
                  <span>
                    {methodLabel(m.payment_method)} ({m.c})
                  </span>
                  <span className="num">{som(m.t)}</span>
                </div>
              ))}
              <div className="mt-3 flex justify-between border-t border-line pt-2 text-sm text-muted">
                <span>Kassadagi naqd</span>
                <span className="num">{som(data.cash)}</span>
              </div>
            </Card>
            <Card className="p-4">
              <div className="mb-3 font-bold">Kassirlar</div>
              {data.byCashier.map((m) => (
                <div key={m.name} className="flex justify-between py-1 text-sm">
                  <span>
                    {m.name} ({m.c})
                  </span>
                  <span className="num">{som(m.t)}</span>
                </div>
              ))}
              <div className="mt-3 font-bold">Xarajatlar</div>
              {data.expenseRows.map((m) => (
                <div key={m.category} className="flex justify-between py-1 text-sm">
                  <span>{m.category}</span>
                  <span className="num text-danger">{som(m.s)}</span>
                </div>
              ))}
            </Card>
          </div>
          <Card className="overflow-x-auto">
            <div className="px-4 py-3 font-bold">ABC tahlil — mahsulotlar</div>
            <table className="w-full text-left text-sm">
              <thead className="bg-bg text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Sinf</th>
                  <th className="px-4 py-2 font-medium">Mahsulot</th>
                  <th className="px-4 py-2 font-medium">Soni</th>
                  <th className="px-4 py-2 font-medium">Savdo</th>
                  <th className="px-4 py-2 font-medium">Foyda</th>
                </tr>
              </thead>
              <tbody>
                {data.abc.map((p) => (
                  <tr key={p.name} className="border-t border-line">
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          p.class === "A" ? "bg-emerald-100 text-ok" : p.class === "B" ? "bg-amber-100 text-amber-800" : "bg-slate-100"
                        }`}
                      >
                        {p.class}
                      </span>
                    </td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 num">{p.qty}</td>
                    <td className="px-4 py-2 num">{som(p.revenue)}</td>
                    <td className="px-4 py-2 num">{som(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <div className="text-muted">Yuklanmoqda...</div>
      )}
    </div>
  );
}
