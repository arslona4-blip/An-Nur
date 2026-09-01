"use client";

export function FiscalQr({ data, size = 128 }: { data: string; size?: number }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Fiskal QR" width={size} height={size} className="mx-auto rounded-lg bg-white p-1" />
  );
}
