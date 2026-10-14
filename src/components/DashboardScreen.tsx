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
  const week = data.chart.reduce((sum, c) => sum + c.total, 0);
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <InfoTile tone="from-teal-500 to-emerald-600" title="So‘nggi 7 kun" value={som(week)}>
          <div className="flex h-28 items-end gap-1.5 pt-2">
            {data.chart.map((c) => (
              <div key={c.day} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-teal-600 to-emerald-400"
                    style={{ height: `${Math.max(6, (c.total / max) * 100)}%` }}
                    title={som(c.total)}
                  />
                </div>
                <div className="text-[10px] text-muted">{c.day}</div>
              </div>
            ))}
          </div>
        </InfoTile>

        <InfoTile tone="from-sky-500 to-blue-600" title="To‘lov turlari" value={som(data.today.sales)}>
          {data.methods.length === 0 ? <Empty>Bugun savdo yo‘q</Empty> : null}
          {data.methods.map((m) => (
            <Row key={m.payment_method} left={methodLabel(m.payment_method)} right={som(m.t)} strong />
          ))}
          {data.payables != null ? <Row left="Ta’minotchi qarzi" right={som(data.payables)} /> : null}
          {data.today.expenses != null ? <Row left="Bugungi xarajat" right={som(data.today.expenses)} /> : null}
        </InfoTile>

        <InfoTile tone="from-violet-500 to-purple-600" title="Oxirgi savdolar" value={`${data.recent.length} ta`}>
          {data.recent.length === 0 ? <Empty>Hali savdo yo‘q</Empty> : null}
          {data.recent.map((s) => (
            <Row
              key={s.id}
              left={
                <>
                  <span className="font-medium">{s.number}</span>
                  <span className="block text-[11px] text-muted">
                    {s.cashier_name} · {tashkentDateTime(s.created_at)}
                  </span>
                </>
              }
              right={
                <>
                  <span className="font-semibold">{som(s.total)}</span>
                  <span className="block text-[11px] text-muted">{methodLabel(s.payment_method)}</span>
                </>
              }
            />
          ))}
        </InfoTile>

        <InfoTile
          tone="from-rose-500 to-red-600"
          title="Kam qolgan"
          value={`${data.lowStock.length} ta`}
          href={data.payables != null ? "/buyurtma" : undefined}
          link="Buyurtma"
        >
          {data.lowStock.length === 0 ? <Empty>Hamma mahsulot yetarli</Empty> : null}
          {data.lowStock.map((p) => (
            <Row
              key={p.id}
              left={p.name}
              right={
                <span className="text-danger">
                  {p.stock} / {p.min_stock} {p.unit}
                </span>
              }
            />
          ))}
        </InfoTile>

        <InfoTile tone="from-amber-500 to-orange-600" title="Muddati yaqin" value={`${data.expiring.length} ta`} href="/muddat" link="Barchasi">
          {data.expiring.length === 0 ? <Empty>Muddati yaqin mahsulot yo‘q</Empty> : null}
          {data.expiring.map((p, i) => (
            <Row
              key={`${p.id}-${i}`}
              left={p.name}
              right={
                <span className={p.days_left <= 2 ? "font-semibold text-danger" : "text-amber-700"}>{expiryLabel(p.days_left)}</span>
              }
            />
          ))}
        </InfoTile>
      </div>
    </div>
  );
}

function InfoTile({
  tone,
  title,
  value,
  href,
  link,
  children,
}: {
  tone: string;
  title: string;
  value: string;
  href?: string;
  link?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-sm">
      <div className={`relative overflow-hidden bg-gradient-to-br ${tone} px-4 py-3 text-white`}>
        <span className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/10" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-white/85">{title}</span>
          {href ? (
            <Link href={href} className="rounded-lg bg-white/20 px-2 py-0.5 text-[11px] font-semibold hover:bg-white/30">
              {link}
            </Link>
          ) : null}
        </div>
        <div className="num mt-1 text-xl font-extrabold">{value}</div>
      </div>
      <div className="max-h-56 flex-1 space-y-0.5 overflow-y-auto px-3 py-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ left, right, strong }: { left: ReactNode; right: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-line/60 py-1.5 last:border-0">
      <span className="min-w-0">{left}</span>
      <span className={`num shrink-0 text-right ${strong ? "font-semibold" : "text-muted"}`}>{right}</span>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="py-2 text-muted">{children}</div>;
}
