"use client";

import Link from "next/link";
import { Scale, ScanLine, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { FiscalQr } from "@/components/FiscalQr";
import { ScaleReader } from "@/components/ScaleReader";
import { Button, Input, Modal, Select } from "@/components/ui";
import { api, NetworkError } from "@/lib/client";
import { queueOfflineSale } from "@/lib/offline";
import { dualPrice, methodLabel, PAYMENT_METHODS, som } from "@/lib/format";

type Product = {
  id: number;
  name: string;
  barcode: string | null;
  category_id: number | null;
  category_name: string | null;
  unit: string;
  sell_price: number;
  stock: number;
};
type Category = { id: number; name: string; color: string };
type Customer = { id: number; name: string; phone: string | null; debt: number };
type CartLine = { product: Product; qty: number };
type Sale = {
  id: number;
  number: string;
  total: number;
  discount?: number;
  paid: number;
  change_amount: number;
  debt_amount: number;
  payment_method: string;
  customer_name?: string;
  created_at: string;
  items: Array<{ name: string; qty: number; unit: string; sell_price: number; total: number }>;
};

export function KassaScreen() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | 0>(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<number | 0>(0);
  const [discount, setDiscount] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState("naqd");
  const [paid, setPaid] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [fiscalQr, setFiscalQr] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null);
  const [qtyValue, setQtyValue] = useState("1");
  const [shift, setShift] = useState<{ id: number; opening_cash: number } | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [autoDiscount, setAutoDiscount] = useState(0);
  const [appliedRules, setAppliedRules] = useState<string[]>([]);
  const [itemDiscounts, setItemDiscounts] = useState<Record<number, number>>({});

  async function load(search = q) {
    const [p, c, cust, s, sh] = await Promise.all([
      api<{ products: Product[] }>(`/api/products?q=${encodeURIComponent(search)}`),
      api<{ categories: Category[] }>("/api/categories"),
      api<{ customers: Customer[] }>("/api/customers"),
      api<{ settings: Record<string, string> }>("/api/settings"),
      api<{ shift: { id: number; opening_cash: number } | null }>("/api/shifts"),
    ]);
    setProducts(p.products);
    setCategories(c.categories);
    setCustomers(cust.customers);
    setSettings(s.settings);
    setShift(sh.shift);
  }

  useEffect(() => {
    load("").catch((e) => setError(e.message));
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => !categoryId || p.category_id === categoryId);
  }, [products, categoryId]);

  function addProduct(p: Product, qty = 1) {
    setCart((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + qty };
        return next;
      }
      return [...prev, { product: p, qty }];
    });
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = q.trim();
    if (!code) return;
    const exact = products.find((p) => p.barcode === code || p.name.toLowerCase() === code.toLowerCase());
    if (exact) {
      if (exact.unit === "kg" || exact.unit === "litr") {
        setQtyProduct(exact);
        setQtyValue("1");
      } else addProduct(exact, 1);
      setQ("");
      return;
    }
    load(code).catch((err) => setError(err.message));
  }

  function clickProduct(p: Product) {
    if (p.unit === "kg" || p.unit === "litr") {
      setQtyProduct(p);
      setQtyValue("1");
      return;
    }
    addProduct(p, 1);
  }

  const subtotal = cart.reduce((s, l) => s + Math.round(l.qty * l.product.sell_price), 0);
  const lineDiscountTotal = cart.reduce((s, l) => s + (itemDiscounts[l.product.id] || 0), 0);
  const total = Math.max(0, subtotal - Math.round(discount || 0) - autoDiscount - lineDiscountTotal);

  const refreshDiscounts = useCallback(async (lines: CartLine[]) => {
    if (!lines.length) {
      setAutoDiscount(0);
      setItemDiscounts({});
      setAppliedRules([]);
      return;
    }
    try {
      const d = await api<{
        preview: {
          saleDiscount: number;
          itemDiscounts: Record<number, number>;
          appliedRules: string[];
        };
      }>("/api/discounts", {
        method: "POST",
        body: JSON.stringify({
          action: "preview",
          items: lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        }),
      });
      setAutoDiscount(d.preview.saleDiscount);
      setItemDiscounts(d.preview.itemDiscounts);
      setAppliedRules(d.preview.appliedRules);
    } catch {
      setAutoDiscount(0);
      setItemDiscounts({});
      setAppliedRules([]);
    }
  }, []);

  useEffect(() => {
    refreshDiscounts(cart);
  }, [cart, refreshDiscounts]);

  const usdEnabled = settings.usd_enabled === "1";
  const usdRate = Number(settings.usd_rate || 12500);

  async function checkout() {
    setError("");
    setBusy(true);
    const paidNum = method === "qarz" ? Number(paid || 0) : method === "usd" ? Number(paid || 0) : Number(paid || total);
    const payload = {
      clientId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
      customerId: customerId || null,
      paymentMethod: method,
      discount: Math.round(Number(discount || 0) + autoDiscount),
      paid: method === "usd" ? Math.round(paidNum * usdRate) : paidNum,
      foreignPaid: method === "usd" ? paidNum : undefined,
      items: cart.map((l) => ({
        product_id: l.product.id,
        qty: l.qty,
        discount: itemDiscounts[l.product.id] || 0,
      })),
    };
    try {
      const data = await api<{ sale: Sale }>("/api/sales", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setPayOpen(false);
      setCart([]);
      setDiscount(0);
      setCustomerId(0);
      setReceipt(data.sale);
      setFiscalQr(null);
      if (settings.fiscal_enabled === "1" && data.sale.id) {
        api<{ qr: string }>(`/api/fiscal?saleId=${data.sale.id}`)
          .then((f) => setFiscalQr(f.qr))
          .catch(() => {});
      }
      await load("");
    } catch (e) {
      if (e instanceof NetworkError) {
        queueOfflineSale({ ...payload, soldAt: new Date().toISOString() });
        setPayOpen(false);
        setCart([]);
        setDiscount(0);
        setError("Server bilan aloqa yo'q — savdo offline navbatga saqlandi");
        return;
      }
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function printReceipt() {
    window.print();
    if (settings.printer_ip && receipt?.id) {
      try {
        await api("/api/print", {
          method: "POST",
          body: JSON.stringify({ action: "network", saleId: receipt.id }),
        });
      } catch {
        /* tarmoq printeri ixtiyoriy */
      }
    }
  }

  return (
    <div className="-m-4 -mb-28 flex h-[calc(100dvh-3.5rem)] flex-col pb-20 md:-m-6 md:mb-0 md:h-dvh md:pb-0">
      {!shift ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Smena ochilmagan.{" "}
          <Link href="/smena" className="font-semibold underline">
            Smenani ochish
          </Link>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
        <form onSubmit={onSearchSubmit} className="relative flex gap-2">
          <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 text-muted" size={18} />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.length === 0) load("").catch(() => {});
            }}
            placeholder="Nomi yoki shtrix-kod... Enter"
            className="h-12 pl-10 text-base"
          />
          </div>
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-white text-brand"
            aria-label="Skaner"
          >
            <ScanLine size={20} />
          </button>
          <button
            type="button"
            onClick={() => setScaleOpen(true)}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line bg-white text-brand"
            aria-label="Tarozi"
          >
            <Scale size={20} />
          </button>
        </form>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategoryId(0)}
            className={`rounded-full px-3 py-1.5 text-sm ${categoryId === 0 ? "bg-brand text-white" : "bg-white border border-line"}`}
          >
            Hammasi
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryId(c.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${categoryId === c.id ? "bg-brand text-white" : "bg-white border border-line"}`}
            >
              {c.name}
            </button>
          ))}
        </div>
        {error ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
        <div className="mt-3 grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pb-2 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => clickProduct(p)}
              className="rounded-2xl border border-line bg-white p-3 text-left hover:border-brand"
            >
              <div className="text-sm font-semibold leading-snug">{p.name}</div>
              <div className="mt-1 text-xs text-muted">
                {p.stock} {p.unit}
              </div>
              <div className="mt-2 font-bold text-brand num text-xs leading-snug">
                {dualPrice(p.sell_price, usdRate, usdEnabled)}
              </div>
            </button>
          ))}
        </div>
      </section>

      <aside className="flex max-h-[46%] w-full shrink-0 flex-col border-t border-line bg-white md:max-h-none md:w-[380px] md:border-l md:border-t-0">
        <div className="border-b border-line p-4">
          <div className="text-sm font-semibold">Savatcha</div>
          <Select value={customerId} onChange={(e) => setCustomerId(Number(e.target.value))}>
            <option value={0}>Mijoz tanlanmagan</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.debt ? ` (qarz ${som(c.debt)})` : ""}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted">Mahsulot qo‘shing yoki shtrix-kodni skanerlang</div>
          ) : (
            cart.map((line) => (
              <div key={line.product.id} className="flex items-center gap-2 rounded-xl bg-bg p-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{line.product.name}</div>
                  <div className="text-xs text-muted num">{som(line.product.sell_price)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="h-8 w-8 rounded-lg bg-white"
                    onClick={() =>
                      setCart((prev) =>
                        prev
                          .map((l) =>
                            l.product.id === line.product.id
                              ? { ...l, qty: Math.round((l.qty - (l.product.unit === "dona" ? 1 : 0.1)) * 1000) / 1000 }
                              : l,
                          )
                          .filter((l) => l.qty > 0.0001),
                      )
                    }
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-sm num">{line.qty}</span>
                  <button
                    className="h-8 w-8 rounded-lg bg-white"
                    onClick={() =>
                      setCart((prev) =>
                        prev.map((l) =>
                          l.product.id === line.product.id
                            ? { ...l, qty: Math.round((l.qty + (l.product.unit === "dona" ? 1 : 0.1)) * 1000) / 1000 }
                            : l,
                        ),
                      )
                    }
                  >
                    +
                  </button>
                </div>
                <button aria-label="O‘chirish" className="p-1 text-muted" onClick={() => setCart((prev) => prev.filter((l) => l.product.id !== line.product.id))}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
        <div className="space-y-2 border-t border-line p-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            Chegirma
            <Input
              type="number"
              className="w-36"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
          {appliedRules.length ? (
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-ok">
              Avto chegirma: {appliedRules.join(", ")} (−{som(autoDiscount + lineDiscountTotal)})
            </div>
          ) : null}
          <div className="flex justify-between text-sm text-muted">
            <span>Jami</span>
            <span className="num">{som(subtotal)}</span>
          </div>
          <div className="flex justify-between text-xl font-extrabold">
            <span>To‘lov</span>
            <span className="num text-brand">{som(total)}</span>
          </div>
          <Button
            className="h-12 w-full text-base"
            disabled={!cart.length}
            onClick={() => {
              setMethod("naqd");
              setPaid(String(total));
              setError("");
              setPayOpen(true);
            }}
          >
            To‘lash
          </Button>
        </div>
      </aside>
      </div>

      <Modal open={!!qtyProduct} title={qtyProduct?.name || ""} onClose={() => setQtyProduct(null)}>
        <div className="space-y-3">
          <Input value={qtyValue} onChange={(e) => setQtyValue(e.target.value)} type="number" step="0.001" />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setScaleOpen(true);
              }}
            >
              Tarozi
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (qtyProduct) addProduct(qtyProduct, Number(qtyValue) || 1);
                setQtyProduct(null);
              }}
            >
              Qo'shish
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={payOpen} title="To‘lov" onClose={() => setPayOpen(false)}>
        <div className="grid grid-cols-2 gap-2">
          {PAYMENT_METHODS.filter((m) => m.id !== "usd" || usdEnabled).map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setMethod(m.id);
                setPaid(
                  m.id === "qarz"
                    ? "0"
                    : m.id === "usd"
                      ? usdRate > 0
                        ? (Math.ceil((total / usdRate) * 100) / 100).toFixed(2)
                        : ""
                      : String(total),
                );
              }}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold ${method === m.id ? "border-brand bg-brand text-white" : "border-line"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {method === "qarz" && !customerId ? (
          <div className="mt-3 text-sm text-danger">Qarzga sotish uchun mijoz tanlang.</div>
        ) : null}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between font-bold">
            <span>Summa</span>
            <span className="num">{dualPrice(total, usdRate, usdEnabled)}</span>
          </div>
          <Input
            type="number"
            step={method === "usd" ? "0.01" : "1"}
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            placeholder={
              method === "qarz" ? "Hozir to'lanadigan" : method === "usd" ? "USD miqdori" : "Qabul qilingan pul"
            }
          />
          {method === "naqd" ? (
            <div className="text-sm text-muted">
              Qaytim: <b className="num text-ink">{som(Math.max(0, Number(paid || 0) - total))}</b>
            </div>
          ) : null}
          {method === "usd" ? (
            <div className="text-sm text-muted">
              ≈ {som(Math.round(Number(paid || 0) * usdRate))} (kurs {usdRate.toLocaleString()})
            </div>
          ) : null}
          {error ? <div className="text-sm text-danger">{error}</div> : null}
          <Button className="w-full" disabled={busy || (method === "qarz" && !customerId)} onClick={checkout}>
            {busy ? "Saqlanmoqda..." : "Chek chiqarish"}
          </Button>
        </div>
      </Modal>

      <Modal open={!!receipt} title="Savdo yakunlandi" onClose={() => setReceipt(null)}>
        {receipt ? (
          <div>
            <div id="receipt-print" className="receipt-thermal space-y-1 text-sm">
              <div className="text-center font-bold">{settings.store_name}</div>
              <div className="text-center text-xs text-muted">{settings.store_address}</div>
              <div className="text-center text-xs">{receipt.number}</div>
              <hr className="my-2" />
              {receipt.items.map((it, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span>
                    {it.name} × {it.qty}
                  </span>
                  <span className="num">{som(it.total)}</span>
                </div>
              ))}
              <hr className="my-2" />
              {receipt.discount ? (
                <div className="flex justify-between">
                  <span>Chegirma</span>
                  <span className="num">−{som(receipt.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-bold">
                <span>Jami</span>
                <span className="num">{som(receipt.total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>{methodLabel(receipt.payment_method)}</span>
                <span>Qaytim {som(receipt.change_amount)}</span>
              </div>
              {receipt.debt_amount ? <div>Qarz: {som(receipt.debt_amount)}</div> : null}
              {fiscalQr && settings.fiscal_enabled === "1" ? (
                <div className="pt-2">
                  <div className="mb-1 text-center text-xs text-muted">Fiskal QR</div>
                  <FiscalQr data={fiscalQr} size={120} />
                </div>
              ) : null}
              <div className="pt-2 text-center text-xs">{settings.receipt_footer}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setReceipt(null)}>
                Yangi savdo
              </Button>
              <Button className="flex-1" onClick={printReceipt}>
                Chop etish
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {scanOpen ? (
        <BarcodeScanner
          onScan={(code) => {
            setQ(code);
            const exact = products.find((p) => p.barcode === code);
            if (exact) {
              if (exact.unit === "kg" || exact.unit === "litr") {
                setQtyProduct(exact);
                setQtyValue("1");
              } else addProduct(exact, 1);
              setQ("");
            } else {
              load(code).catch((err) => setError(err.message));
            }
          }}
          onClose={() => setScanOpen(false)}
        />
      ) : null}

      {scaleOpen ? (
        <ScaleReader
          onWeight={(w) => {
            setQtyValue(String(w));
            setScaleOpen(false);
          }}
          onClose={() => setScaleOpen(false)}
        />
      ) : null}
    </div>
  );
}
