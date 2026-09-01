"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { som, tashkentDateTime } from "@/lib/format";

type Shift = {
  id: number;
  user_name?: string;
  opened_at: string;
  closed_at?: string;
  opening_cash: number;
  closing_cash?: number;
  expected_cash?: number;
  difference?: number;
  sales_total: number;
  returns_total: number;
  status: string;
  note?: string;
};

export function ShiftScreen() {
  const [shift, setShift] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [openCash, setOpenCash] = useState("0");
  const [closeCash, setCloseCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await api<{ shift: Shift | null; shifts: Shift[] }>("/api/shifts");
    setShift(d.shift);
    setShifts(d.shifts);
  }

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function openShift() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ shift: Shift }>("/api/shifts", {
        method: "POST",
        body: JSON.stringify({ action: "open", openingCash: Number(openCash || 0) }),
      });
      setShift(d.shift);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function showReport(id: number) {
    const d = await api<{ text: string }>(`/api/shifts?action=report&id=${id}`);
    setReportText(d.text);
    setReportOpen(true);
  }

  function printReport() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<pre style="font-family:monospace;padding:16px">${reportText.replace(/</g, "&lt;")}</pre>`);
    w.print();
  }

  async function closeShift() {
    setBusy(true);
    setError("");
    try {
      await api("/api/shifts", {
        method: "POST",
        body: JSON.stringify({ action: "close", closingCash: Number(closeCash || 0), note: closeNote }),
      });
      setCloseOpen(false);
      setCloseCash("");
      setCloseNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Kassa smenasi</h1>
        <p className="text-sm text-muted">Smena ochish, yopish va naqd hisob-kitob</p>
      </div>
      {error ? <div className="text-sm text-danger">{error}</div> : null}

      {shift ? (
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="font-bold text-ok">Ochiq smena</div>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-ok">Faol</span>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>Ochildi: {tashkentDateTime(shift.opened_at)}</div>
            <div>Boshlang‘ich naqd: <span className="num">{som(shift.opening_cash)}</span></div>
          </div>
          <Button variant="danger" onClick={() => setCloseOpen(true)}>
            Smenani yopish
          </Button>
        </Card>
      ) : (
        <Card className="space-y-3 p-4">
          <div className="font-bold">Yangi smena ochish</div>
          <Field label="Kassadagi naqd (boshlang‘ich)">
            <Input type="number" value={openCash} onChange={(e) => setOpenCash(e.target.value)} />
          </Field>
          <Button disabled={busy} onClick={openShift}>
            {busy ? "Ochilyapti..." : "Smenani ochish"}
          </Button>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <div className="px-4 py-3 font-bold">Oxirgi smenalar</div>
        <table className="w-full text-left text-sm">
          <thead className="bg-bg text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Kassir</th>
              <th className="px-4 py-2 font-medium">Ochilgan</th>
              <th className="px-4 py-2 font-medium">Yopilgan</th>
              <th className="px-4 py-2 font-medium">Savdo</th>
              <th className="px-4 py-2 font-medium">Farq</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-2">{s.user_name}</td>
                <td className="px-4 py-2">{tashkentDateTime(s.opened_at)}</td>
                <td className="px-4 py-2">{s.closed_at ? tashkentDateTime(s.closed_at) : "—"}</td>
                <td className="px-4 py-2 num">{som(s.sales_total)}</td>
                <td className={`px-4 py-2 num ${s.difference ? (s.difference < 0 ? "text-danger" : "text-ok") : ""}`}>
                  {s.difference != null ? som(s.difference) : "—"}
                </td>
                <td className="px-4 py-2">
                  <button className="text-brand text-sm" onClick={() => showReport(s.id).catch((e) => setError(e.message))}>
                    Hisobot
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={closeOpen} title="Smenani yopish" onClose={() => setCloseOpen(false)}>
        <div className="space-y-3">
          <Field label="Kassadagi naqd (yakuniy)">
            <Input type="number" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} autoFocus />
          </Field>
          <Field label="Izoh (ixtiyoriy)">
            <Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
          </Field>
          <Button className="w-full" variant="danger" disabled={busy} onClick={closeShift}>
            {busy ? "Yopilyapti..." : "Tasdiqlash"}
          </Button>
        </div>
      </Modal>

      <Modal open={reportOpen} title="Smena hisoboti" onClose={() => setReportOpen(false)} wide>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-bg p-4 text-sm">{reportText}</pre>
        <div className="mt-3 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setReportOpen(false)}>
            Yopish
          </Button>
          <Button className="flex-1" onClick={printReport}>
            Chop etish
          </Button>
        </div>
      </Modal>
    </div>
  );
}
