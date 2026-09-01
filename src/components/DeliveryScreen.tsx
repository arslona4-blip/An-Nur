"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { methodLabel, som, tashkentDateTime } from "@/lib/format";

type Order = {
  id: number;
  number: string;
  customer_name: string;
  phone: string;
  address: string;
  status: string;
  subtotal: number;
  delivery_fee: number;
  total: number;
  user_name: string;
  created_at: string;
  items?: Array<{ name: string; qty: number; unit: string; total: number }>;
};

type Product = { id: number; name: string; unit: string; sell_price: number; stock: number };
type Customer = { id: number; name: string; phone: string | null };
type Status = { id: string; label: string };

type Line = { product_id: number; name: string; qty: string };

export function DeliveryScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ customerId: 0, customerName: "", phone: "", address: "", deliveryFee: "0", note: "" });
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(status = filter) {
    const url = status ? `/api/delivery?status=${status}` : "/api/delivery";
    const d = await api<{ orders: Order[]; statuses: Status[] }>(url);
    setOrders(d.orders);
    setStatuses(d.statuses);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
    Promise.all([
      api<{ products: Product[] }>("/api/products"),
      api<{ customers: Customer[] }>("/api/customers"),
    ]).then(([p, c]) => {
      setProducts(p.products);
      setCustomers(c.customers);
    });
  }, []);

  function addLine() {
    const p = products.find((x) => String(x.id) === pick);
    if (!p) return;
    setLines((prev) => [...prev, { product_id: p.id, name: p.name, qty: pickQty }]);
    setPick("");
    setPickQty("1");
  }

  async function createOrder() {
    setBusy(true);
    setError("");
    try {
      await api("/api/delivery", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.customerId || null,
          customerName: form.customerName,
          phone: form.phone,
          address: form.address,
          deliveryFee: Number(form.deliveryFee || 0),
          note: form.note,
          items: lines.map((l) => ({ product_id: l.product_id, qty: Number(l.qty) })),
        }),
      });
      setOpen(false);
      setLines([]);
      setForm({ customerId: 0, customerName: "", phone: "", address: "", deliveryFee: "0", note: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: number, status: string, paymentMethod?: string) {
    await api("/api/delivery", {
      method: "POST",
      body: JSON.stringify({ action: "status", id, status, paymentMethod }),
    });
    if (detail?.id === id) {
      const d = await api<{ order: Order }>(`/api/delivery?id=${id}`);
      setDetail(d.order);
    }
    await load();
  }

  async function openDetail(id: number) {
    const d = await api<{ order: Order }>(`/api/delivery?id=${id}`);
    setDetail(d.order);
  }

  const statusLabel = (id: string) => statuses.find((s) => s.id === id)?.label || id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Yetkazib berish</h1>
          <p className="text-sm text-muted">Buyurtmalar va holat kuzatuvi</p>
        </div>
        <Button onClick={() => setOpen(true)}>Yangi buyurtma</Button>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}

      <div className="flex flex-wrap gap-2">
        <button
          className={`rounded-full px-3 py-1.5 text-sm ${!filter ? "bg-brand text-white" : "border border-line bg-white"}`}
          onClick={() => {
            setFilter("");
            load("").catch((e) => setError(e.message));
          }}
        >
          Hammasi
        </button>
        {statuses.map((s) => (
          <button
            key={s.id}
            className={`rounded-full px-3 py-1.5 text-sm ${filter === s.id ? "bg-brand text-white" : "border border-line bg-white"}`}
            onClick={() => {
              setFilter(s.id);
              load(s.id).catch((e) => setError(e.message));
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Raqam</th>
              <th className="px-4 py-3 font-medium">Mijoz</th>
              <th className="px-4 py-3 font-medium">Manzil</th>
              <th className="px-4 py-3 font-medium">Summa</th>
              <th className="px-4 py-3 font-medium">Holat</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium">{o.number}</td>
                <td className="px-4 py-3">
                  <div>{o.customer_name}</div>
                  <div className="text-xs text-muted">{o.phone}</div>
                </td>
                <td className="px-4 py-3 max-w-[200px] truncate">{o.address}</td>
                <td className="px-4 py-3 num">{som(o.total)}</td>
                <td className="px-4 py-3">{statusLabel(o.status)}</td>
                <td className="px-4 py-3">
                  <button className="text-brand" onClick={() => openDetail(o.id)}>
                    Ochish
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} title="Yetkazib berish buyurtmasi" onClose={() => setOpen(false)} wide>
        <div className="space-y-3">
          <Field label="Mijoz">
            <Select
              value={form.customerId}
              onChange={(e) => {
                const id = Number(e.target.value);
                const c = customers.find((x) => x.id === id);
                setForm({
                  ...form,
                  customerId: id,
                  customerName: c?.name || form.customerName,
                  phone: c?.phone || form.phone,
                });
              }}
            >
              <option value={0}>Yangi mijoz</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ism">
            <Input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Yetkazish narxi">
              <Input type="number" value={form.deliveryFee} onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })} />
            </Field>
          </div>
          <Field label="Manzil">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1">
              <option value="">Mahsulot</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stock} {p.unit})
                </option>
              ))}
            </Select>
            <Input className="w-24" type="number" step="0.001" value={pickQty} onChange={(e) => setPickQty(e.target.value)} />
            <Button variant="ghost" onClick={addLine}>
              +
            </Button>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span>{l.name}</span>
              <span>{l.qty}</span>
            </div>
          ))}
          <Button className="w-full" disabled={busy || !lines.length} onClick={createOrder}>
            {busy ? "Saqlanmoqda..." : "Buyurtma yaratish"}
          </Button>
        </div>
      </Modal>

      <Modal open={!!detail} title={detail?.number || ""} onClose={() => setDetail(null)} wide>
        {detail ? (
          <div className="space-y-3 text-sm">
            <div>{detail.customer_name} · {detail.phone}</div>
            <div className="text-muted">{detail.address}</div>
            <div className="font-bold num">{som(detail.total)} (yetkazish {som(detail.delivery_fee)})</div>
            <div>Holat: <b>{statusLabel(detail.status)}</b></div>
            {detail.items?.map((it, i) => (
              <div key={i} className="flex justify-between border-t border-line py-1">
                <span>{it.name}</span>
                <span>{it.qty} {it.unit} — {som(it.total)}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              {detail.status === "new" ? (
                <Button onClick={() => setStatus(detail.id, "preparing")}>Tayyorlash</Button>
              ) : null}
              {detail.status === "preparing" ? (
                <Button onClick={() => setStatus(detail.id, "delivering")}>Yo'lga chiqdi</Button>
              ) : null}
              {detail.status === "delivering" ? (
                <>
                  <Button onClick={() => setStatus(detail.id, "done", "naqd")}>Yetkazildi (naqd)</Button>
                  <Button variant="ghost" onClick={() => setStatus(detail.id, "done", "uzcard")}>Uzcard</Button>
                </>
              ) : null}
              {detail.status !== "done" && detail.status !== "cancelled" ? (
                <Button variant="danger" onClick={() => setStatus(detail.id, "cancelled")}>
                  Bekor qilish
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
