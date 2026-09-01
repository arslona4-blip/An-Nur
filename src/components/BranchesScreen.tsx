"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal } from "@/components/ui";
import { api } from "@/lib/client";

type Branch = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  active: number;
};

export function BranchesScreen() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [current, setCurrent] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "" });
  const [error, setError] = useState("");

  async function load() {
    const d = await api<{ branches: Branch[]; current: Branch }>("/api/branches");
    setBranches(d.branches);
    setCurrent(d.current);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function switchBranch(id: number) {
    await api("/api/branches", { method: "POST", body: JSON.stringify({ action: "switch", id }) });
    await load();
    window.location.reload();
  }

  async function save() {
    await api("/api/branches", { method: "POST", body: JSON.stringify(form) });
    setOpen(false);
    setForm({ name: "", address: "", phone: "" });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">Filiallar</h1>
          <p className="text-sm text-muted">Ko'p filial boshqaruvi — hozirgi: {current?.name || "—"}</p>
        </div>
        <Button onClick={() => setOpen(true)}>Yangi filial</Button>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nomi</th>
              <th className="px-4 py-3 font-medium">Manzil</th>
              <th className="px-4 py-3 font-medium">Telefon</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className={`border-t border-line ${current?.id === b.id ? "bg-emerald-50" : ""}`}>
                <td className="px-4 py-3 font-medium">
                  {b.name}
                  {current?.id === b.id ? <span className="ml-2 text-xs text-ok">(faol)</span> : null}
                </td>
                <td className="px-4 py-3">{b.address || "—"}</td>
                <td className="px-4 py-3">{b.phone || "—"}</td>
                <td className="px-4 py-3 text-right">
                  {current?.id !== b.id ? (
                    <Button variant="ghost" onClick={() => switchBranch(b.id)}>
                      Tanlash
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} title="Yangi filial" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Nomi">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Manzil">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="Telefon">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Button className="w-full" onClick={save}>
            Saqlash
          </Button>
        </div>
      </Modal>
    </div>
  );
}
