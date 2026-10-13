"use client";

import { Send, Share2 } from "lucide-react";

export function ReceiptShare({ title }: { title: string }) {
  function share() {
    const url = location.href;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(url).catch(() => {});
  }

  function telegram() {
    const url = encodeURIComponent(location.href);
    location.href = `https://t.me/share/url?url=${url}&text=${encodeURIComponent(title)}`;
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-2">
      <button
        onClick={telegram}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-3 py-3 text-sm font-semibold text-white"
      >
        <Send size={16} />
        Telegram’da saqlash
      </button>
      <button
        onClick={share}
        className="flex items-center justify-center gap-2 rounded-xl border border-line px-3 py-3 text-sm font-semibold"
      >
        <Share2 size={16} />
        Ulashish
      </button>
    </div>
  );
}
