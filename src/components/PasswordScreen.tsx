"use client";

import { FormEvent, useState } from "react";
import { Button, Input } from "@/components/ui";
import { api } from "@/lib/client";

export function PasswordScreen({ name, username }: { name: string; username: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== repeat) {
      setError("Yangi parollar bir xil emas");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current, next }) });
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.replace("/login");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h2 className="text-2xl font-extrabold">Yangi parol o‘rnating</h2>
        <p className="text-sm text-muted">
          {name} ({username}), siz standart parol bilan kirdingiz. Bu parol hammaga ma’lum, shuning uchun davom
          etishdan oldin o‘zingizning parolingizni o‘rnating.
        </p>
        <Input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Joriy parol"
          autoComplete="current-password"
        />
        <Input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Yangi parol (kamida 6 belgi)"
          autoComplete="new-password"
        />
        <Input
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          placeholder="Yangi parolni takrorlang"
          autoComplete="new-password"
        />
        {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={busy || !current || !next}>
          {busy ? "Saqlanmoqda..." : "Saqlash va davom etish"}
        </Button>
        <Button variant="ghost" className="w-full" onClick={logout}>
          Chiqish
        </Button>
      </form>
    </div>
  );
}
