"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Button, Input } from "@/components/ui";
import { PRODUCT_LOGO, PRODUCT_NAME } from "@/lib/brand";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/access")
      .then((r) => r.json())
      .then((d) => setUrls(d.urls || []))
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand-dark p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand/40" />
        <div className="absolute -bottom-16 -left-10 h-80 w-80 rounded-full bg-accent/20" />
        <div className="relative flex flex-1 flex-col items-center justify-center">
          <Image
            src={PRODUCT_LOGO}
            alt={PRODUCT_NAME}
            width={360}
            height={360}
            className="w-full max-w-[320px] rounded-2xl shadow-2xl"
            priority
          />
        </div>
        <ul className="relative space-y-3 text-sm text-white/80">
          <li>• Telefon — savdo va qoldiqni kuzatish</li>
          <li>• Planshet — kassa va ombor</li>
          <li>• Kompyuter — to‘liq hisobot</li>
        </ul>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <Image src={PRODUCT_LOGO} alt={PRODUCT_NAME} width={160} height={160} className="w-36 rounded-xl shadow-lg" priority />
          </div>
          <h2 className="text-2xl font-extrabold">Tizimga kirish</h2>
          <p className="text-sm text-muted">Do‘kon kompyuteri, planshet yoki telefondan kiring.</p>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Login" autoComplete="username" />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Parol"
            autoComplete="current-password"
          />
          {error ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</div> : null}
          <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
            {loading ? "Tekshirilmoqda..." : "Kirish"}
          </Button>
          <div className="rounded-xl bg-bg p-3 text-xs text-muted">
            Demo: <b>admin / admin123</b> yoki <b>kassir / kassir123</b>
          </div>
          {urls.length ? (
            <div className="rounded-xl border border-line p-3 text-xs">
              <div className="mb-1 font-semibold text-ink">Telefon / planshet</div>
              <div className="text-muted">Shu Wi‑Fi da brauzerda oching:</div>
              {urls.map((u) => (
                <div key={u} className="mt-1 break-all font-semibold text-brand">
                  {u}
                </div>
              ))}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
