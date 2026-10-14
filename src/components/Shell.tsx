"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Clock, LayoutGrid, LogOut, Package, ShoppingCart, Users } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import type { SessionUser } from "@/lib/auth";
import { DisplayToggles } from "@/components/DisplayPrefs";
import { PRODUCT_LOGO, PRODUCT_NAME } from "@/lib/brand";
import { ALL_ITEMS, PANEL_LINKS, isActive } from "@/lib/menu";

export function Shell({
  user,
  storeName,
  branchName,
  children,
}: {
  user: SessionUser;
  storeName: string;
  branchName?: string;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const home = path === "/";
  // the till has its own pay bar at the bottom; the tab bar would cover it on phones
  const onKassa = path.startsWith("/kassa");
  const current = ALL_ITEMS.find((n) => isActive(path, n.href));
  const forbidden = ALL_ITEMS.some((n) => path.startsWith(n.href) && !n.roles.includes(user.role));
  const admin = user.role === "admin";

  useEffect(() => {
    if (forbidden) router.replace("/");
  }, [forbidden, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const bottom = [
    { href: "/", label: "Menyu", icon: LayoutGrid },
    { href: "/qarzlar", label: "Qarz", icon: BookOpen },
    { href: "/kassa", label: "Kassa", icon: ShoppingCart, main: true },
    admin ? { href: "/mahsulotlar", label: "Mahsulot", icon: Package } : { href: "/mijozlar", label: "Mijozlar", icon: Users },
    { href: "/smena", label: "Smena", icon: Clock },
  ];

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-[210px] shrink-0 flex-col gap-3 bg-gradient-to-b from-brand-dark to-brand p-4 text-white md:flex">
        <Image src={PRODUCT_LOGO} alt={PRODUCT_NAME} width={48} height={48} className="h-12 w-12 rounded-xl object-cover" />
        <div>
          <div className="text-lg font-extrabold leading-tight">{storeName}</div>
          <div className="mt-1 text-xs text-white/70">{PRODUCT_NAME}</div>
          {branchName ? <div className="text-xs text-white/70">{branchName}</div> : null}
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Link
            href="/"
            className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
              home ? "bg-white/25" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            <LayoutGrid size={18} />
            Bosh menyu
          </Link>
          <Link
            href="/kassa"
            className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm font-extrabold text-brand-dark shadow hover:bg-white/90"
          >
            <ShoppingCart size={18} />
            Kassa
          </Link>
          {PANEL_LINKS.filter((l) => l.roles.includes(user.role)).map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                  isActive(path, l.href) ? "bg-white/25" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                <Icon size={18} />
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="flex-1" />

        <DisplayToggles dark />
        <div className="border-t border-white/20 pt-3 text-sm">
          <div className="font-semibold">{user.name}</div>
          <div className="text-xs text-white/60">{admin ? "Administrator" : "Kassir"}</div>
        </div>
        <button
          onClick={logout}
          className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm hover:bg-white/20"
        >
          <LogOut size={16} />
          Chiqish
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-gradient-to-r from-brand-dark to-brand px-3 py-2.5 text-white shadow-md md:hidden">
          {home ? (
            <Image src={PRODUCT_LOGO} alt={PRODUCT_NAME} width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <Link href="/" title="Bosh menyu" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
              <LayoutGrid size={20} />
            </Link>
          )}
          <div className="min-w-0">
            <div className="truncate font-extrabold leading-tight">{home ? storeName : current?.label || PRODUCT_NAME}</div>
            <div className="truncate text-[11px] text-white/70">{home ? branchName || PRODUCT_NAME : storeName}</div>
          </div>
          <button onClick={logout} title="Chiqish" className="ml-auto grid h-10 w-10 place-items-center rounded-xl bg-white/10">
            <LogOut size={18} />
          </button>
        </header>

        <main className={`w-full flex-1 p-4 md:p-6 md:pb-6 ${onKassa ? "pb-4" : "pb-28"}`}>{forbidden ? null : children}</main>
      </div>

      <nav
        className={`fixed inset-x-0 bottom-0 z-20 grid-cols-5 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] md:hidden ${
          onKassa ? "hidden" : "grid"
        }`}
      >
        {bottom.map((item) => {
          const Icon = item.icon;
          const active = isActive(path, item.href);
          return item.main ? (
            <Link key={item.href} href={item.href} className="flex flex-col items-center justify-end pb-1.5 text-[11px] font-bold text-brand">
              <span className="-mt-6 mb-0.5 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-dark text-white shadow-lg ring-4 ring-paper">
                <Icon size={24} />
              </span>
              {item.label}
            </Link>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-brand" : "text-muted"}`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
