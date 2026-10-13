import { notFound } from "next/navigation";
import { ReceiptShare } from "@/components/ReceiptShare";
import { methodLabel, som, tashkentDateTime } from "@/lib/format";
import { publicReceipt } from "@/lib/phase7";

export const dynamic = "force-dynamic";

export const metadata = { title: "Elektron chek", robots: { index: false, follow: false } };

function qtyText(qty: number, unit: string) {
  const shown = Number.isInteger(qty) ? String(qty) : qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${shown} ${unit}`;
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = publicReceipt(token);
  if (!r) notFound();
  return (
    <main className="min-h-dvh bg-bg px-4 py-6">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm">
        <div className="text-center">
          <div className="text-xl font-extrabold">{r.store.name}</div>
          {r.store.address ? <div className="text-sm text-muted">{r.store.address}</div> : null}
          {r.store.phone ? <div className="text-sm text-muted num">{r.store.phone}</div> : null}
          <div className="mt-3 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-ok">Elektron chek</div>
          <div className="mt-2 text-sm num">{r.number}</div>
          <div className="text-xs text-muted">{tashkentDateTime(r.created_at)}</div>
        </div>
        <hr className="my-4 border-dashed border-line" />
        <div className="space-y-3">
          {r.items.map((it, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{it.name}</div>
                <div className="text-xs text-muted num">
                  {qtyText(it.qty, it.unit)} × {som(it.sell_price)}
                  {it.discount ? ` · chegirma −${som(it.discount)}` : ""}
                </div>
              </div>
              <div className="shrink-0 font-semibold num">{som(it.total)}</div>
            </div>
          ))}
        </div>
        <hr className="my-4 border-dashed border-line" />
        <div className="space-y-1 text-sm">
          {r.discount ? (
            <div className="flex justify-between text-muted">
              <span>Chegirma</span>
              <span className="num">−{som(r.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-lg font-extrabold">
            <span>Jami</span>
            <span className="num text-brand">{som(r.total)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>To‘lov</span>
            <span>{methodLabel(r.payment_method)}</span>
          </div>
          {r.change_amount ? (
            <div className="flex justify-between text-muted">
              <span>Qaytim</span>
              <span className="num">{som(r.change_amount)}</span>
            </div>
          ) : null}
          {r.debt_amount ? (
            <div className="flex justify-between text-danger">
              <span>Qarzga yozildi</span>
              <span className="num">{som(r.debt_amount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-muted">
            <span>Kassir</span>
            <span>{r.cashier}</span>
          </div>
        </div>
        {r.store.footer ? <div className="mt-5 text-center text-sm text-muted">{r.store.footer}</div> : null}
        <ReceiptShare title={`${r.store.name} — chek ${r.number}`} />
      </div>
    </main>
  );
}
