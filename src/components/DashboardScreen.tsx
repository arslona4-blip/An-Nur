"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { api } from "@/lib/client";
import { expiryLabel, methodLabel, som, tashkentDateTime } from "@/lib/format";

type Dash = {
  today: { sales: number; count: number; profit: number | null; expenses: number | null; net: number | null };
  cash: number | null;
  debts: number;
  payables: number | null;
  lowStock: Array<{ id: number; name: string; stock: number; min_stock: number; unit: string }>;
  expiring: Array<{ id: number; name: string; expiry_date: string; days_left: number; stock: number; unit: string }>;
  recent: Array<{
    id: number;
    number: string;
    total: number;
    payment_method: string;
    cashier_name: string;
    created_at: string;
  }>;
  chart: Array<{ day: string; total: number }>;
  methods: Array<{ payment_method: string; t: number }>;
  settings: Record<string, string>;
};

export function DashboardScreen({ menu }: { menu?: ReactNode } = {}) {
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dash>("/api/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error || !data) {
    const status = error ? <div className="text-danger">{error}</div> : <div className="text-muted">Yuklanmoqda...</div>;
    return menu ? (
      <div className="space-y-6">
        {menu}
        {status}
      </div>
    ) : (
      status
    );
  }

  const max = Math.max(...data.chart.map((c) => c.total), 1);
  const cards = [
    { label: "Bugungi savdo", value: som(data.today.sales), sub: `${data.today.count} ta chek` },
    data.today.profit != null ? { label: "Foyda", value: som(data.today.profit), sub: "sotish − tannarx" } : null,
    data.cash != null ? { label: "Kassadagi naqd", value: som(data.cash), sub: "hozirgi qoldiq" } : null,
    { label: "Mijoz qarzi", value: som(data.debts), sub: "haqdorlar" },
  ].filter((c) => c !== null);

  const cardList = cards.map((c) => (
    <Card key={c.label} className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{c.label}</div>
      <div className="mt-2 text-2xl font-extrabold num">{c.value}</div>
      <div className="mt-1 text-xs text-muted">{c.sub}</div>
    </Card>
  ));

  return (
    <div className="space-y-6">
      {menu ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0">{menu}</div>
          <div className="lg:w-64 lg:shrink-0">
            <div className="mb-2.5 px-1 text-xs font-bold uppercase tracking-wider text-muted">Bugungi holat</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">{cardList}</div>
          </div>
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-extrabold">{data.settings.store_name}</h1>
            <p className="text-sm text-muted">Bugungi holat — raqamlar jonli yangilanadi</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cardList}</div>
        </>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-4 font-bold">So‘nggi 7 kun savdosi</div>
          <div className="flex h-40 items-end gap-2">
            {data.chart.map((c) => (
              <div key={c.day} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-lg bg-brand"
                    style={{ height: `${Math.max(6, (c.total / max) * 100)}%` }}
                    title={som(c.total)}
                  />
                </div>
                <div className="text-[11px] text-muted">{c.day}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-3 font-bold">To‘lov turlari</div>
          <div className="space-y-2 text-sm">
            {data.methods.length === 0 ? <div className="text-muted">Bugun savdo yo‘q</div> : null}
            {data.methods.map((m) => (
              <div key={m.payment_method} className="flex justify-between">
                <span>{methodLabel(m.payment_method)}</span>
                <span className="num font-semibold">{som(m.t)}</span>
              </div>
            ))}
            {data.payables != null ? (
              <div className="flex justify-between border-t border-line pt-2 text-muted">
                <span>Ta’minotchi qarzi</span>
                <span className="num">{som(data.payables)}</span>
              </div>
            ) : null}
            {data.today.expenses != null ? (
              <div className="flex justify-between text-muted">
                <span>Bugungi xarajat</span>
                <span className="num">{som(data.today.expenses)}</span>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3 font-bold">Oxirgi savdolar</div>
          <div className="divide-y divide-line">
            {data.recent.length === 0 ? <div className="p-4 text-sm text-muted">Hali savdo yo‘q</div> : null}
            {data.recent.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">{s.number}</div>
                  <div className="text-xs text-muted">
                    {s.cashier_name} · {tashkentDateTime(s.created_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="num font-semibold">{som(s.total)}</div>
                  <div className="text-xs text-muted">{methodLabel(s.payment_method)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="font-bold">Kam qolgan mahsulot</div>
            {data.payables != null ? (
              <Link href="/buyurtma" className="text-xs text-brand">
                Buyurtma tuzish
              </Link>
            ) : null}
          </div>
          <div className="divide-y divide-line">
            {data.lowStock.length === 0 ? <div className="p-4 text-sm text-muted">Hamma mahsulot yetarli</div> : null}
            {data.lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{p.name}</span>
                <span className="num text-danger">
                  {p.stock} / {p.min_stock} {p.unit}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="font-bold">Muddati yaqin</div>
            <Link href="/muddat" className="text-xs text-brand">
              Barchasi
            </Link>
          </div>
          <div className="divide-y divide-line">
            {data.expiring.length === 0 ? <div className="p-4 text-sm text-muted">Muddati yaqin mahsulot yo'q</div> : null}
            {data.expiring.map((p, i) => (
              <div key={`${p.id}-${i}`} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{p.name}</span>
                <span className={`num ${p.days_left <= 2 ? "text-danger font-semibold" : "text-amber-700"}`}>
                  {expiryLabel(p.days_left)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
