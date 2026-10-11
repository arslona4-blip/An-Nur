"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";

type User = { id: number; username: string; name: string; role: "admin" | "kassir"; active: number };

export function StaffScreen({ weakPassword = false }: { weakPassword?: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "kassir" });
  const [edit, setEdit] = useState<{ id: number; username: string; name: string; role: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setUsers((await api<{ users: User[] }>("/api/users")).users);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

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
        body: JSON.stringify({ id: edit.id, name: edit.name, role: edit.role, password: edit.password || undefined }),
      });
      setNotice(edit.password ? `${edit.username}: parol yangilandi` : `${edit.username}: saqlandi`);
      setEdit(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

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
                {u.username} · {u.role === "admin" ? "Administrator" : "Kassir"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setEdit({ id: u.id, username: u.username, name: u.name, role: u.role, password: "" })}
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
