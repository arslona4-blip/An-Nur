"use client";

import { ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

export function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    async function start() {
      if (!window.BarcodeDetector) {
        setSupported(false);
        setError("Bu brauzer kamera skanerini qo'llab-quvvatlamaydi. Shtrix-kodni qo'lda kiriting.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "qr_code"],
        });
        timer = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes[0]?.rawValue) {
              onScan(codes[0].rawValue);
              onClose();
            }
          } catch {
            /* ignore frame errors */
          }
        }, 350);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kameraga ruxsat bering");
      }
    }

    start();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onClose, onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2 font-semibold">
          <ScanLine size={20} />
          Shtrix-kod skaner
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
          <X size={20} />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {supported ? (
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        ) : null}
        {supported ? (
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-2 border-accent" />
        ) : null}
      </div>
      {error ? <div className="p-4 text-center text-sm text-red-300">{error}</div> : null}
      <div className="p-4">
        <Button variant="ghost" className="w-full bg-white/10 text-white" onClick={onClose}>
          Bekor qilish
        </Button>
      </div>
    </div>
  );
}
