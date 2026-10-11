"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { api } from "@/lib/client";
import { expiryLabel, qty } from "@/lib/format";

type Expiring = {
  id: number;
  name: string;
  stock: number;
  unit: string;
  expiry_date: string;
  days_left: number;
  category_name?: string;
  source: string;
};

export function ExpiryScreen() {
  const [products, setProducts] = useState<Expiring[]>([]);
  const [days, setDays] = useState("7");
  const [error, setError] = useState("");

  async function load(d = days) {
    const data = await api<{ products: Expiring[] }>(`/api/expiry?days=${d}`);
    setProducts(data.products);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Muddati yaqin mahsulotlar</h1>
          <p className="text-sm text-muted">Tezroq sotish yoki yo'qotishga qayd etish kerak</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Kun ichida:</span>
          <select
            className="rounded-xl border border-line px-3 py-2"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              load(e.target.value).catch((err) => setError(err.message));
            }}
          >
            {[3, 7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} kun
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Mahsulot</th>
              <th className="px-4 py-3 font-medium">Qoldiq</th>
              <th className="px-4 py-3 font-medium">Muddati</th>
              <th className="px-4 py-3 font-medium">Qolgan kun</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Muddati yaqin mahsulot yo'q
                </td>
              </tr>
            ) : null}
            {products.map((p, i) => (
              <tr key={`${p.id}-${i}`} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3">{qty(Number(p.stock), p.unit)}</td>
                <td className="px-4 py-3">{p.expiry_date}</td>
                <td className={`px-4 py-3 font-semibold ${p.days_left <= 2 ? "text-danger" : p.days_left <= 5 ? "text-amber-700" : ""}`}>
                  {expiryLabel(p.days_left)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
