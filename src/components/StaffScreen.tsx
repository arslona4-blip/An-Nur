"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";
import { som, tashkentDate } from "@/lib/format";

type User = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "kassir";
  active: number;
  commission_pct?: number;
  commission_base?: string;
};
type Edit = { id: number; username: string; name: string; role: string; password: string; pct: string; base: string };
type KpiRow = {
  id: number;
  name: string;
  pct: number;
  base: string;
  count: number;
  sales: number;
  returns: number;
  net: number;
  profit: number;
  commission: number;
  paid: number;
  due: number;
};

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function StaffScreen({ weakPassword = false }: { weakPassword?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "kassir" });
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [month, setMonth] = useState(() => tashkentDate().slice(0, 7));
  const [kpi, setKpi] = useState<KpiRow[]>([]);
  const [paying, setPaying] = useState<KpiRow | null>(null);
  const [payMethod, setPayMethod] = useState("naqd");

  async function load() {
    setUsers((await api<{ users: User[] }>("/api/users")).users);
  }

  async function loadKpi(m = month) {
    const { from, to } = monthRange(m);
    setKpi((await api<{ kpi: { rows: KpiRow[] } }>(`/api/users/kpi?from=${from}&to=${to}`)).kpi.rows);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    loadKpi(month).catch((e) => setError(e.message));
  }, [month]);

  async function save() {
    setError("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setOpen(false);
      setForm({ username: "", password: "", name: "", role: "kassir" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function toggle(u: User) {
    setError("");
    try {
      await api("/api/users", { method: "PUT", body: JSON.stringify({ id: u.id, active: !u.active }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setError("");
    try {
      await api("/api/users", {
        method: "PUT",
        body: JSON.stringify({
          id: edit.id,
          name: edit.name,
          role: edit.role,
          password: edit.password || undefined,
          commissionPct: Number(edit.pct || 0),
          commissionBase: edit.base,
        }),
      });
      setNotice(edit.password ? `${edit.username}: parol yangilandi` : `${edit.username}: saqlandi`);
      setEdit(null);
      await Promise.all([load(), loadKpi()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function pay() {
    if (!paying) return;
    setError("");
    try {
      const { from, to } = monthRange(month);
      const d = await api<{ kpi: { rows: KpiRow[] } }>("/api/users/kpi", {
        method: "POST",
        body: JSON.stringify({ userId: paying.id, from, to, method: payMethod }),
      });
      setKpi(d.kpi.rows);
      setNotice(`${paying.name}: ${som(paying.due)} foiz to‘landi va xarajatga (Oylik) yozildi`);
      setPaying(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  const totalDue = kpi.reduce((s, r) => s + r.due, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Xodimlar</h1>
        <Button onClick={() => setOpen(true)}>Xodim qo‘shish</Button>
      </div>
      {weakPassword && !notice ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Siz standart parol bilan kirdingiz. Xavfsizlik uchun «Tahrirlash» orqali administrator va kassir parollarini
          almashtiring.
        </div>
      ) : null}
      {notice ? <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 last:border-0">
            <div>
              <div className="font-semibold">{u.name}</div>
              <div className="text-xs text-muted">
                <span data-latin>{u.username}</span> · {u.role === "admin" ? "Administrator" : "Kassir"}
                {u.commission_pct ? ` · ${u.commission_pct}% ${u.commission_base === "foyda" ? "foydadan" : "savdodan"}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() =>
                  setEdit({
                    id: u.id,
                    username: u.username,
                    name: u.name,
                    role: u.role,
                    password: "",
                    pct: u.commission_pct ? String(u.commission_pct) : "",
                    base: u.commission_base === "foyda" ? "foyda" : "savdo",
                  })
                }
              >
                Tahrirlash
              </Button>
              <Button variant={u.active ? "ghost" : "gold"} onClick={() => toggle(u)}>
                {u.active ? "Faol" : "O‘chiq"}
              </Button>
            </div>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h2 className="text-lg font-extrabold">Sotuvchi foizi</h2>
          <p className="text-sm text-muted">
            Har xodimning savdosi va hisoblangan foizi. Foizni «Tahrirlash» orqali belgilang.
          </p>
        </div>
        <Input type="month" className="w-44" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] whitespace-nowrap text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Xodim</th>
              <th className="px-4 py-3 font-medium">Cheklar</th>
              <th className="px-4 py-3 font-medium">Savdo</th>
              <th className="px-4 py-3 font-medium">Qaytarish</th>
              <th className="px-4 py-3 font-medium">Foyda</th>
              <th className="px-4 py-3 font-medium">Foiz</th>
              <th className="px-4 py-3 font-medium">Hisoblandi</th>
              <th className="px-4 py-3 font-medium">To‘langan</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {kpi.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-muted">
                  Bu oyda savdo yo‘q
                </td>
              </tr>
            ) : null}
            {kpi.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-3 font-semibold">{r.name}</td>
                <td className="px-4 py-3 num">{r.count}</td>
                <td className="px-4 py-3 num">{som(r.sales)}</td>
                <td className="px-4 py-3 num text-muted">{r.returns ? `−${som(r.returns)}` : "—"}</td>
                <td className="px-4 py-3 num">{som(r.profit)}</td>
                <td className="px-4 py-3">
                  {r.pct ? `${r.pct}% ${r.base === "foyda" ? "foydadan" : "savdodan"}` : <span className="text-muted">—</span>}
                </td>
                <td className="px-4 py-3 num font-bold text-brand">{som(r.commission)}</td>
                <td className="px-4 py-3 num">{r.paid ? som(r.paid) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  {r.due > 0 ? (
                    <Button variant="ghost" onClick={() => setPaying(r)}>
                      To‘lash {som(r.due)}
                    </Button>
                  ) : r.commission > 0 ? (
                    <span className="text-xs font-semibold text-ok">To‘langan</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {totalDue > 0 ? (
          <div className="border-t border-line px-4 py-3 text-right text-sm">
            Jami to‘lanishi kerak: <b className="num">{som(totalDue)}</b>
          </div>
        ) : null}
      </Card>

      <Modal open={!!edit} title={edit ? `Tahrirlash — ${edit.username}` : ""} onClose={() => setEdit(null)}>
        {edit ? (
          <div className="space-y-3">
            <Field label="Ism">
              <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label="Rol">
              <Select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                <option value="kassir">Kassir</option>
                <option value="admin">Administrator</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sotuvchi foizi, %">
                <Input
                  type="number"
                  min="0"
                  max="50"
                  step="0.1"
                  value={edit.pct}
                  onChange={(e) => setEdit({ ...edit, pct: e.target.value })}
                  placeholder="0 — foizsiz"
                />
              </Field>
              <Field label="Nimadan">
                <Select value={edit.base} onChange={(e) => setEdit({ ...edit, base: e.target.value })}>
                  <option value="savdo">Savdo summasidan</option>
                  <option value="foyda">Foydadan</option>
                </Select>
              </Field>
            </div>
            <Field label="Yangi parol (o‘zgartirmaslik uchun bo‘sh qoldiring)">
              <Input
                type="password"
                autoComplete="new-password"
                value={edit.password}
                onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                placeholder="kamida 6 belgi"
              />
            </Field>
            <Button className="w-full" onClick={saveEdit}>
              Saqlash
            </Button>
          </div>
        ) : null}
      </Modal>
      <Modal open={!!paying} title={paying ? `Foizni to‘lash — ${paying.name}` : ""} onClose={() => setPaying(null)}>
        {paying ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-bg px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span>Hisoblangan</span>
                <span className="num">{som(paying.commission)}</span>
              </div>
              {paying.paid ? (
                <div className="flex justify-between text-muted">
                  <span>Oldin to‘langan</span>
                  <span className="num">−{som(paying.paid)}</span>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between text-lg font-extrabold">
                <span>To‘lanadi</span>
                <span className="num text-brand">{som(paying.due)}</span>
              </div>
            </div>
            <Field label="Qanday to‘lanadi">
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="naqd">Kassadan naqd</option>
                <option value="otkazma">Kartaga o‘tkazma</option>
              </Select>
            </Field>
            <p className="text-xs text-muted">Xarajatlarga «Oylik» bo‘lib yoziladi.</p>
            <Button className="w-full" onClick={pay}>
              To‘lash
            </Button>
          </div>
        ) : null}
      </Modal>
      <Modal open={open} title="Yangi xodim" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Ism">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Login">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <Field label="Parol">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="Rol">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="kassir">Kassir</option>
              <option value="admin">Administrator</option>
            </Select>
          </Field>
          <Button className="w-full" onClick={save}>
            Saqlash
          </Button>
        </div>
      </Modal>
    </div>
  );
}
