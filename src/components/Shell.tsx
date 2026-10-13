"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  MapPin,
  Package,
  Percent,
  RotateCcw,
  Settings,
  ShoppingCart,
  Tags,
  Trash2,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { DisplayToggles } from "@/components/DisplayPrefs";
import { PRODUCT_LOGO, PRODUCT_NAME } from "@/lib/brand";

const NAV = [
  { href: "/", label: "Bosh sahifa", icon: LayoutDashboard, roles: ["admin", "kassir"] },
  { href: "/kassa", label: "Kassa", icon: ShoppingCart, roles: ["admin", "kassir"] },
  { href: "/qarzlar", label: "Qarz daftari", icon: BookOpen, roles: ["admin", "kassir"] },
  { href: "/smena", label: "Smena", icon: Clock, roles: ["admin", "kassir"] },
  { href: "/qaytarish", label: "Qaytarish", icon: RotateCcw, roles: ["admin", "kassir"] },
  { href: "/muddat", label: "Muddati yaqin", icon: CalendarClock, roles: ["admin", "kassir"] },
  { href: "/chegirmalar", label: "Chegirmalar", icon: Percent, roles: ["admin"] },
  { href: "/mahsulotlar", label: "Mahsulotlar", icon: Package, roles: ["admin"] },
  { href: "/narxlar", label: "Narxlar", icon: Tags, roles: ["admin"] },
  { href: "/ombor", label: "Ombor", icon: Warehouse, roles: ["admin"] },
  { href: "/buyurtma", label: "Buyurtma", icon: ClipboardList, roles: ["admin"] },
  { href: "/inventar", label: "Inventar", icon: Warehouse, roles: ["admin"] },
  { href: "/yoqotish", label: "Yo'qotish", icon: Trash2, roles: ["admin"] },
  { href: "/mijozlar", label: "Mijozlar", icon: Users, roles: ["admin", "kassir"] },
  { href: "/yetkazish", label: "Yetkazish", icon: MapPin, roles: ["admin", "kassir"] },
  { href: "/taminotchilar", label: "Ta'minotchilar", icon: Truck, roles: ["admin"] },
  { href: "/pul", label: "Pul aylanmasi", icon: Wallet, roles: ["admin"] },
  { href: "/filiallar", label: "Filiallar", icon: Building2, roles: ["admin"] },
  { href: "/hisobotlar", label: "Hisobotlar", icon: BarChart3, roles: ["admin"] },
  { href: "/xodimlar", label: "Xodimlar", icon: UserCog, roles: ["admin"] },
  { href: "/sozlamalar", label: "Sozlamalar", icon: Settings, roles: ["admin"] },
];

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
  const [menu, setMenu] = useState(false);
  const items = useMemo(() => NAV.filter((n) => n.roles.includes(user.role)), [user.role]);
  const quick = items.slice(0, 4);
  const forbidden = NAV.some((n) => n.href !== "/" && path.startsWith(n.href) && !n.roles.includes(user.role));

  useEffect(() => {
    if (forbidden) router.replace("/");
  }, [forbidden, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function renderNavLinks(compact?: boolean) {
    return items.map((item) => {
      const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMenu(false)}
          className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium lg:py-2.5 ${
            compact ? "justify-center lg:justify-start" : ""
          } ${active ? "bg-white text-brand-dark" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
          title={item.label}
        >
          <Icon size={18} />
          <span className={compact ? "hidden lg:inline" : ""}>{item.label}</span>
        </Link>
      );
    });
  }

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col bg-brand-dark text-white md:flex lg:w-[248px]">
        <div className="border-b border-white/10 px-3 py-5 lg:px-5">
          <div className="flex items-center gap-3">
            <Image
              src={PRODUCT_LOGO}
              alt={PRODUCT_NAME}
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-xl object-cover"
            />
            <div className="hidden min-w-0 lg:block">
              <div className="text-lg font-extrabold tracking-tight">{PRODUCT_NAME}</div>
              <div className="truncate text-xs text-white/60">{storeName}</div>
              {branchName ? <div className="truncate text-[10px] text-white/45">{branchName}</div> : null}
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2 lg:p-3">
          {renderNavLinks(true)}
        </nav>
        <div className="border-t border-white/10 p-3 lg:p-4">
          <div className="mb-3">
            <DisplayToggles dark />
          </div>
          <div className="mb-3 hidden text-sm lg:block">
            <div className="font-semibold">{user.name}</div>
            <div className="text-xs text-white/50">{user.role === "admin" ? "Administrator" : "Kassir"}</div>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-sm hover:bg-white/15 lg:justify-center"
          >
            <LogOut size={16} />
            <span className="hidden lg:inline">Chiqish</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-line"
            aria-label="Menyu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 font-extrabold">
            <Image src={PRODUCT_LOGO} alt={PRODUCT_NAME} width={32} height={32} className="h-8 w-8 rounded-lg object-cover" />
            {PRODUCT_NAME}
          </div>
          <button onClick={logout} className="h-11 px-2 text-sm text-muted">
            Chiqish
          </button>
        </header>
        <main className="flex-1 p-4 pb-28 md:p-6 md:pb-6">{forbidden ? null : children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
          {quick.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${active ? "text-brand" : "text-muted"}`}
              >
                <Icon size={20} />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted"
          >
            <Menu size={20} />
            Yana
          </button>
        </nav>
      </div>

      {menu ? (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col bg-brand-dark text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <div>
                <div className="font-extrabold">{PRODUCT_NAME}</div>
                <div className="text-xs text-white/60">{storeName}</div>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center" onClick={() => setMenu(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {renderNavLinks()}
            </nav>
            <div className="border-t border-white/10 p-4 text-sm">
              <div className="mb-3">
                <DisplayToggles dark />
              </div>
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-white/50">{user.role === "admin" ? "Administrator" : "Kassir"}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
