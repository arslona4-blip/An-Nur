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
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { DisplayToggles } from "@/components/DisplayPrefs";
import { PRODUCT_LOGO, PRODUCT_NAME } from "@/lib/brand";

type NavItem = { href: string; label: string; icon: LucideIcon; roles: string[] };

const ALL = ["admin", "kassir"];
const ADMIN = ["admin"];

const KASSA: NavItem = { href: "/kassa", label: "Kassa", icon: ShoppingCart, roles: ALL };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Savdo",
    items: [
      { href: "/", label: "Bugungi holat", icon: LayoutDashboard, roles: ALL },
      { href: "/qarzlar", label: "Qarz daftari", icon: BookOpen, roles: ALL },
      { href: "/qaytarish", label: "Qaytarish", icon: RotateCcw, roles: ALL },
      { href: "/smena", label: "Smena", icon: Clock, roles: ALL },
      { href: "/yetkazish", label: "Yetkazish", icon: MapPin, roles: ALL },
    ],
  },
  {
    title: "Mahsulot va ombor",
    items: [
      { href: "/mahsulotlar", label: "Mahsulotlar", icon: Package, roles: ADMIN },
      { href: "/narxlar", label: "Narxlar", icon: Tags, roles: ADMIN },
      { href: "/chegirmalar", label: "Chegirmalar", icon: Percent, roles: ADMIN },
      { href: "/ombor", label: "Ombor", icon: Warehouse, roles: ADMIN },
      { href: "/buyurtma", label: "Buyurtma", icon: ClipboardList, roles: ADMIN },
      { href: "/inventar", label: "Inventar", icon: Warehouse, roles: ADMIN },
      { href: "/muddat", label: "Muddati yaqin", icon: CalendarClock, roles: ALL },
      { href: "/yoqotish", label: "Yo'qotish", icon: Trash2, roles: ADMIN },
    ],
  },
  {
    title: "Odamlar",
    items: [
      { href: "/mijozlar", label: "Mijozlar", icon: Users, roles: ALL },
      { href: "/taminotchilar", label: "Ta'minotchilar", icon: Truck, roles: ADMIN },
      { href: "/xodimlar", label: "Xodimlar", icon: UserCog, roles: ADMIN },
    ],
  },
  {
    title: "Pul va hisobot",
    items: [
      { href: "/hisobotlar", label: "Hisobotlar", icon: BarChart3, roles: ADMIN },
      { href: "/pul", label: "Pul aylanmasi", icon: Wallet, roles: ADMIN },
    ],
  },
  {
    title: "Boshqaruv",
    items: [
      { href: "/filiallar", label: "Filiallar", icon: Building2, roles: ADMIN },
      { href: "/sozlamalar", label: "Sozlamalar", icon: Settings, roles: ADMIN },
    ],
  },
];

const NAV = [KASSA, ...GROUPS.flatMap((g) => g.items)];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}

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
  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => n.roles.includes(user.role)) })).filter(
        (g) => g.items.length,
      ),
    [user.role],
  );
  const quick = useMemo(
    () =>
      ["/kassa", "/", "/qarzlar", user.role === "admin" ? "/mahsulotlar" : "/mijozlar"]
        .map((href) => NAV.find((n) => n.href === href))
        .filter((n): n is NavItem => !!n),
    [user.role],
  );
  const current = NAV.find((n) => isActive(path, n.href));
  const forbidden = NAV.some((n) => n.href !== "/" && path.startsWith(n.href) && !n.roles.includes(user.role));

  useEffect(() => {
    if (forbidden) router.replace("/");
  }, [forbidden, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function kassaButton(compact?: boolean) {
    const active = isActive(path, KASSA.href);
    return (
      <Link
        href={KASSA.href}
        onClick={() => setMenu(false)}
        title="Kassa — sotuv"
        className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-base font-extrabold text-white shadow-sm transition ${
          active ? "bg-brand-dark" : "bg-brand hover:bg-brand-dark"
        } ${compact ? "lg:justify-start lg:px-4" : "px-4"}`}
      >
        <ShoppingCart size={20} />
        <span className={compact ? "hidden lg:inline" : ""}>Kassa — sotuv</span>
      </Link>
    );
  }

  function renderGroups(compact?: boolean) {
    return groups.map((g) => (
      <div key={g.title} className="pt-3">
        <div
          className={`px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted/80 ${compact ? "hidden lg:block" : ""}`}
        >
          {g.title}
        </div>
        {compact ? <div className="mx-3 mb-1 border-t border-line lg:hidden" /> : null}
        <div className="space-y-0.5">
          {g.items.map((item) => {
            const active = isActive(path, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenu(false)}
                title={item.label}
                className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  compact ? "justify-center lg:justify-start" : ""
                } ${active ? "bg-brand/10 font-semibold text-brand" : "text-ink/75 hover:bg-bg hover:text-ink"}`}
              >
                {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" /> : null}
                <Icon size={18} />
                <span className={compact ? "hidden lg:inline" : ""}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    ));
  }

  const roleLabel = user.role === "admin" ? "Administrator" : "Kassir";

  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-line bg-paper md:flex lg:w-[252px]">
        <div className="flex items-center gap-3 px-3 py-4 lg:px-5">
          <Image
            src={PRODUCT_LOGO}
            alt={PRODUCT_NAME}
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-xl object-cover"
          />
          <div className="hidden min-w-0 lg:block">
            <div className="text-lg font-extrabold tracking-tight text-brand-dark">{PRODUCT_NAME}</div>
            <div className="truncate text-xs text-muted">{storeName}</div>
          </div>
        </div>
        <div className="px-2 lg:px-3">{kassaButton(true)}</div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 lg:px-3">{renderGroups(true)}</nav>
        <div className="border-t border-line p-3">
          <DisplayToggles />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 hidden items-center justify-between gap-4 border-b border-line bg-paper/90 px-6 py-3 backdrop-blur md:flex">
          <div className="min-w-0">
            <div className="truncate text-lg font-extrabold text-ink">{current?.label || PRODUCT_NAME}</div>
            <div className="truncate text-xs text-muted">
              {storeName}
              {branchName ? ` · ${branchName}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-muted">{roleLabel}</div>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm text-muted hover:bg-bg hover:text-ink"
            >
              <LogOut size={16} />
              Chiqish
            </button>
          </div>
        </header>

        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-line"
            aria-label="Menyu"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 text-center">
            <div className="truncate font-extrabold">{current?.label || PRODUCT_NAME}</div>
            <div className="truncate text-[11px] text-muted">{storeName}</div>
          </div>
          <button onClick={logout} className="h-11 px-2 text-sm text-muted">
            Chiqish
          </button>
        </header>

        <main className="flex-1 p-4 pb-28 md:p-6 md:pb-6">{forbidden ? null : children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
          {quick.map((item) => {
            const Icon = item.icon;
            const active = isActive(path, item.href);
            const main = item.href === KASSA.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  main ? "text-brand" : active ? "text-brand" : "text-muted"
                }`}
              >
                <span className={main ? "grid h-8 w-8 place-items-center rounded-full bg-brand text-white" : ""}>
                  <Icon size={main ? 18 : 20} />
                </span>
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
            className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col bg-paper shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <Image src={PRODUCT_LOGO} alt={PRODUCT_NAME} width={36} height={36} className="h-9 w-9 rounded-lg object-cover" />
                <div className="min-w-0">
                  <div className="font-extrabold text-brand-dark">{PRODUCT_NAME}</div>
                  <div className="truncate text-xs text-muted">{storeName}</div>
                </div>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center" onClick={() => setMenu(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="px-3 pt-3">{kassaButton()}</div>
            <nav className="flex-1 overflow-y-auto px-3 pb-3">{renderGroups()}</nav>
            <div className="border-t border-line p-4 text-sm">
              <div className="mb-3">
                <DisplayToggles />
              </div>
              <div className="font-semibold">{user.name}</div>
              <div className="text-xs text-muted">{roleLabel}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
