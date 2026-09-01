"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal, Select } from "@/components/ui";
import { api } from "@/lib/client";

type User = { id: number; username: string; name: string; role: "admin" | "kassir"; active: number };

export function StaffScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "kassir" });
  const [error, setError] = useState("");

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
    await api("/api/users", { method: "PUT", body: JSON.stringify({ id: u.id, active: !u.active }) });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Xodimlar</h1>
        <Button onClick={() => setOpen(true)}>Xodim qo‘shish</Button>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between border-b border-line px-4 py-3 last:border-0">
            <div>
              <div className="font-semibold">{u.name}</div>
              <div className="text-xs text-muted">
                {u.username} · {u.role === "admin" ? "Administrator" : "Kassir"}
              </div>
            </div>
            <Button variant={u.active ? "ghost" : "gold"} onClick={() => toggle(u)}>
              {u.active ? "Faol" : "O‘chiq"}
            </Button>
          </div>
        ))}
      </Card>
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
