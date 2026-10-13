"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Clock, LayoutGrid, LogOut, Package, ShoppingCart, Users } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import type { SessionUser } from "@/lib/auth";
import { DisplayToggles } from "@/components/DisplayPrefs";
import { PRODUCT_LOGO, PRODUCT_NAME } from "@/lib/brand";
import { ALL_ITEMS, isActive } from "@/lib/menu";

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
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 bg-gradient-to-r from-brand-dark via-brand-dark to-brand text-white shadow-md">
        <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
          {home ? (
            <div className="flex min-w-0 items-center gap-3">
              <Image src={PRODUCT_LOGO} alt={PRODUCT_NAME} width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold leading-tight">{storeName}</div>
                <div className="truncate text-xs text-white/70">
                  {PRODUCT_NAME}
                  {branchName ? ` · ${branchName}` : ""}
                </div>
              </div>
            </div>
          ) : (
            <>
              <Link
                href="/"
                className="flex shrink-0 items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-semibold hover:bg-white/25"
              >
                <LayoutGrid size={18} />
                <span className="hidden sm:inline">Bosh menyu</span>
              </Link>
              <div className="min-w-0">
                <div className="truncate text-lg font-extrabold leading-tight">{current?.label || PRODUCT_NAME}</div>
                <div className="truncate text-xs text-white/70">{storeName}</div>
              </div>
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-3">
            {!home && current?.href !== "/kassa" ? (
              <Link
                href="/kassa"
                className="hidden items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-extrabold text-brand-dark shadow hover:bg-white/90 md:flex"
              >
                <ShoppingCart size={18} />
                Kassa
              </Link>
            ) : null}
            <div className="hidden w-44 lg:block">
              <DisplayToggles dark />
            </div>
            <div className="hidden text-right text-sm md:block">
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-white/60">{admin ? "Administrator" : "Kassir"}</div>
            </div>
            <button
              onClick={logout}
              title="Chiqish"
              className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/20"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Chiqish</span>
            </button>
          </div>
        </div>
      </header>

      <main className="w-full flex-1 p-4 pb-28 md:p-6 md:pb-6">{forbidden ? null : children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] md:hidden">
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
