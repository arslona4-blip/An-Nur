"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { api } from "@/lib/client";
import { som } from "@/lib/format";

type License = {
  code: "off" | "ok" | "soon" | "grace" | "pending" | "blocked";
  message: string;
  paidUntil: string | null;
  shopName: string | null;
  checkedAt: string | null;
  lastError: string | null;
  pay: { card: string; holder: string; phone: string; amount: number | null } | null;
};

const TONE: Record<License["code"], string> = {
  off: "bg-bg text-muted",
  ok: "bg-emerald-50 text-emerald-800",
  soon: "bg-amber-50 text-amber-800",
  grace: "bg-orange-50 text-orange-800",
  pending: "bg-amber-50 text-amber-800",
  blocked: "bg-red-50 text-danger",
};

export function LicenseCard() {
  const [license, setLicense] = useState<License | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ license: License }>("/api/license")
      .then((d) => setLicense(d.license))
      .catch(() => {});
  }, []);

  async function run(body: Record<string, string>, done: string) {
    setBusy(true);
    setMsg("");
    try {
      const d = await api<{ license: License }>("/api/license", { method: "POST", body: JSON.stringify(body) });
      setLicense(d.license);
      setMsg(d.license.lastError && body.action === "refresh" ? `Panel bilan aloqa yo‘q: ${d.license.lastError}` : done);
      if (body.action === "activate") setCode("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  if (!license || license.code === "off") return null;
  return (
    <Card className="space-y-3 p-4">
      <div className="font-bold">Obuna</div>
      <div className={`rounded-xl px-3 py-2 text-sm ${TONE[license.code]}`}>{license.message}</div>
      {license.pay ? (
        <div className="rounded-xl border border-line px-3 py-2 text-sm">
          <div className="text-muted">Oylik to‘lov uchun karta</div>
          <div className="num text-lg font-bold">{license.pay.card}</div>
          {license.pay.holder ? <div>{license.pay.holder}</div> : null}
          {license.pay.amount ? <div className="text-muted">Oylik: {som(license.pay.amount)}</div> : null}
          {license.pay.phone ? <div className="text-muted">To‘lagach xabar bering: {license.pay.phone}</div> : null}
        </div>
      ) : null}
      <div className="text-xs text-muted">
        {license.shopName ? `Do‘kon: ${license.shopName}. ` : ""}
        Oxirgi tekshiruv: {license.checkedAt ? new Date(license.checkedAt).toLocaleString("ru-RU") : "—"}
      </div>
      <Button variant="ghost" disabled={busy} onClick={() => run({ action: "refresh" }, "Obuna holati yangilandi")}>
        Hozir tekshirish
      </Button>
      <div className="text-sm text-muted">Internet bo‘lmasa, sotuvchidan olingan faollashtirish kodini kiriting:</div>
      <textarea
        className="w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-xs"
        rows={3}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Faollashtirish kodi"
      />
      <Button disabled={busy || !code.trim()} onClick={() => run({ action: "activate", code }, "Kassa faollashtirildi")}>
        Faollashtirish
      </Button>
      {msg ? <div className="text-sm">{msg}</div> : null}
    </Card>
  );
}
