"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import type { PayInfo } from "@/lib/license";
import { som } from "@/lib/format";

const TONE: Record<string, string> = {
  soon: "border-amber-300",
  pending: "border-amber-300",
  grace: "border-orange-400",
  blocked: "border-red-400",
};

// The banner is easy to overlook, so the owner also gets this window once a day while payment is due.
export function LicenseNotice({ code, message, pay }: { code: string; message: string; pay: PayInfo | null }) {
  const [open, setOpen] = useState(false);
  const seenKey = `annur-license-notice-${new Date().toLocaleDateString("en-CA")}-${code}`;

  useEffect(() => {
    if (!localStorage.getItem(seenKey)) setOpen(true);
  }, [seenKey]);

  function close() {
    localStorage.setItem(seenKey, "1");
    setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full max-w-md rounded-2xl border-2 bg-white p-6 shadow-xl ${TONE[code] || ""}`}>
        <h2 className="mb-2 text-lg font-bold">Obuna to'lovi</h2>
        <p className="mb-4 text-sm font-semibold">{message}</p>
        {pay ? (
          <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm">
            <div>
              Karta: <span className="num font-semibold">{pay.card}</span>
              {pay.holder ? ` (${pay.holder})` : ""}
            </div>
            {pay.amount ? <div>Oylik: {som(pay.amount)}</div> : null}
            {pay.phone ? <div>To'lagach xabar bering: {pay.phone}</div> : null}
          </div>
        ) : null}
        <Button onClick={close} className="w-full">
          Tushunarli
        </Button>
      </div>
    </div>
  );
}
