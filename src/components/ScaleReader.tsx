"use client";

import { Scale, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

function parseWeight(line: string) {
  const m = line.match(/(\d+[.,]\d+|\d+)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return n > 0 ? n : null;
}

export function ScaleReader({ onWeight, onClose }: { onWeight: (kg: number) => void; onClose: () => void }) {
  const [error, setError] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);

  useEffect(() => {
    return () => {
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  async function connect() {
    setError("");
    if (!("serial" in navigator)) {
      setError("Bu brauzer tarozini qo'llab-quvvatlamaydi. Chrome/Edge ishlating.");
      return;
    }
    try {
      // Web Serial API — Chrome/Edge
      const nav = navigator as Navigator & { serial?: { requestPort: () => Promise<unknown> } };
      const port = (await nav.serial!.requestPort()) as {
        open: (opts: { baudRate: number }) => Promise<void>;
        readable: ReadableStream<Uint8Array> | null;
      };
      await port.open({ baudRate: 9600 });
      const textDecoder = new TextDecoderStream();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (port.readable as any)?.pipeTo(textDecoder.writable).catch(() => {});
      const reader = textDecoder.readable.getReader();
      readerRef.current = reader;
      setConnected(true);
      (async () => {
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value || "";
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const w = parseWeight(line);
            if (w) setWeight(w);
          }
        }
      })();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tarozi ulanmadi");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Scale size={20} />
          Tarozi
        </div>
        <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
          <X size={20} />
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <div className="text-6xl font-black num">{weight != null ? weight.toFixed(3) : "0.000"}</div>
        <div className="text-muted">kg</div>
        {!connected ? (
          <Button onClick={connect}>Taroziga ulanish</Button>
        ) : (
          <Button
            variant="gold"
            onClick={() => {
              if (weight) onWeight(weight);
            }}
            disabled={!weight}
          >
            Og'irlikni qo'llash
          </Button>
        )}
        {error ? <div className="text-center text-sm text-red-300">{error}</div> : null}
        <p className="max-w-sm text-center text-xs text-white/60">
          USB tarozi ulang. Chrome brauzerida «Taroziga ulanish» tugmasini bosing va port tanlang.
        </p>
      </div>
    </div>
  );
}
