"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, ImageIcon } from "lucide-react";
import { Button, Field, Input, Modal } from "@/components/ui";
import { api } from "@/lib/client";
import { som } from "@/lib/format";
import type { PaymentClaim } from "@/lib/license";

const MONTHS = [1, 3, 6, 12];

// Phone photos of receipts are several MB; the panel only needs a readable copy.
async function shrinkPhoto(file: File): Promise<{ data: string; type: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.8);
  return { data: url.slice(url.indexOf(",") + 1), type: "image/jpeg" };
}

export function PaidButton({
  monthly,
  claim,
  className = "",
  onDone,
}: {
  monthly: number | null;
  claim: PaymentClaim | null;
  className?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(monthly ? String(monthly) : "");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ data: string; type: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  if (claim) {
    return (
      <div className={`flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-normal text-emerald-800 ${className}`}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          To‘lov xabari yuborilgan ({new Date(claim.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })},{" "}
          {som(claim.amount)}). Sotuvchi tasdiqlashi bilan kassa o‘zi yangilanadi.
        </span>
      </div>
    );
  }

  function pickMonths(m: number) {
    setMonths(m);
    if (monthly) setAmount(String(monthly * m));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const shrunk = await shrinkPhoto(file);
      setPhoto({ ...shrunk, preview: `data:${shrunk.type};base64,${shrunk.data}` });
    } catch {
      setError("Rasmni o‘qib bo‘lmadi, boshqasini tanlang");
    }
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      await api("/api/license", {
        method: "POST",
        body: JSON.stringify({ action: "claim", months, amount: Number(amount.replace(/\s/g, "")), note, photo: photo?.data, photoType: photo?.type }),
      });
      setOpen(false);
      onDone?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <CheckCircle2 className="h-4 w-4" />
        Men to‘ladim
      </Button>
      <Modal open={open} title="To‘lov qilganingizni xabar bering" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <Field label="Necha oyga to‘ladingiz">
            <div className="grid grid-cols-4 gap-2">
              {MONTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickMonths(m)}
                  className={`rounded-xl border px-2 py-2 text-sm! font-semibold ${months === m ? "border-brand bg-brand text-white" : "border-line bg-white"}`}
                >
                  {m} oy
                </button>
              ))}
            </div>
          </Field>
          <Field label="To‘langan summa (so‘m)">
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ""))} />
          </Field>
          <Field label="Chek rasmi (Click, Payme yoki bank ilovasidan skrinshot)">
            {photo ? (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt="Chek" className="max-h-56 w-full rounded-xl border border-line object-contain" />
                <Button variant="ghost" className="w-full" onClick={() => setPhoto(null)}>
                  Boshqa rasm tanlash
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => cameraRef.current?.click()}>
                  <Camera className="h-4 w-4" />
                  Suratga olish
                </Button>
                <Button variant="ghost" onClick={() => galleryRef.current?.click()}>
                  <ImageIcon className="h-4 w-4" />
                  Galereyadan
                </Button>
              </div>
            )}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
          </Field>
          <Field label="Izoh (ixtiyoriy)">
            <Input value={note} maxLength={300} placeholder="Masalan: Click orqali, Ali nomidan" onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
          <Button className="w-full" disabled={busy || !Number(amount.replace(/\s/g, ""))} onClick={send}>
            {busy ? "Yuborilmoqda…" : "Sotuvchiga yuborish"}
          </Button>
          <p className="text-xs text-muted">Sotuvchi pul kelganini tekshirib tasdiqlaydi, shundan keyin kassa o‘zi yangilanadi.</p>
        </div>
      </Modal>
    </>
  );
}
