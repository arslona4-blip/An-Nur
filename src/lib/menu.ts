import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardList,
  Clock,
  LayoutDashboard,
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
  type LucideIcon,
} from "lucide-react";

export type MenuItem = { href: string; label: string; icon: LucideIcon; roles: string[] };
export type MenuGroup = { title: string; tile: string; items: MenuItem[] };

const ALL = ["admin", "kassir"];
const ADMIN = ["admin"];

export const KASSA: MenuItem = { href: "/kassa", label: "Kassa", icon: ShoppingCart, roles: ALL };
export const HOME: MenuItem = { href: "/", label: "Bosh menyu", icon: LayoutDashboard, roles: ALL };

// tile classes must stay literal so Tailwind picks them up
export const MENU: MenuGroup[] = [
  {
    title: "Savdo",
    tile: "bg-gradient-to-br from-emerald-500 to-teal-600",
    items: [
      { href: "/qarzlar", label: "Qarz daftari", icon: BookOpen, roles: ALL },
      { href: "/qaytarish", label: "Qaytarish", icon: RotateCcw, roles: ALL },
      { href: "/smena", label: "Smena", icon: Clock, roles: ALL },
      { href: "/yetkazish", label: "Yetkazish", icon: MapPin, roles: ALL },
    ],
  },
  {
    title: "Mahsulot va ombor",
    tile: "bg-gradient-to-br from-sky-500 to-blue-600",
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
    tile: "bg-gradient-to-br from-violet-500 to-purple-600",
    items: [
      { href: "/mijozlar", label: "Mijozlar", icon: Users, roles: ALL },
      { href: "/taminotchilar", label: "Ta'minotchilar", icon: Truck, roles: ADMIN },
      { href: "/xodimlar", label: "Xodimlar", icon: UserCog, roles: ADMIN },
    ],
  },
  {
    title: "Pul va hisobot",
    tile: "bg-gradient-to-br from-amber-500 to-orange-600",
    items: [
      { href: "/hisobotlar", label: "Hisobotlar", icon: BarChart3, roles: ADMIN },
      { href: "/pul", label: "Pul aylanmasi", icon: Wallet, roles: ADMIN },
    ],
  },
  {
    title: "Boshqaruv",
    tile: "bg-gradient-to-br from-slate-500 to-slate-700",
    items: [
      { href: "/filiallar", label: "Filiallar", icon: Building2, roles: ADMIN },
      { href: "/sozlamalar", label: "Sozlamalar", icon: Settings, roles: ADMIN },
    ],
  },
];

export const ALL_ITEMS: MenuItem[] = [KASSA, ...MENU.flatMap((g) => g.items)];

export function menuFor(role: string) {
  return MENU.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length);
}

export function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path.startsWith(href);
}
