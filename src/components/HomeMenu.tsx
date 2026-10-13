import Link from "next/link";
import { ChevronRight, ShoppingCart } from "lucide-react";
import { DisplayToggles } from "@/components/DisplayPrefs";
import { menuFor } from "@/lib/menu";

export function HomeMenu({ role, name }: { role: string; name: string }) {
  const groups = menuFor(role);
  return (
    <div className="space-y-6">
      <Link
        href="/kassa"
        className="group relative flex items-center gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-brand to-brand-dark p-6 text-white shadow-lg transition hover:shadow-xl active:scale-[0.99] md:p-8"
      >
        <span className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <span className="absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/5" />
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/20 md:h-20 md:w-20">
          <ShoppingCart size={36} />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-extrabold md:text-3xl">Kassa — sotuvni boshlash</span>
          <span className="mt-1 block text-sm text-white/80 md:text-base">Assalomu alaykum, {name}! Xaridorga mahsulot sotish shu yerda.</span>
        </span>
        <ChevronRight size={32} className="ml-auto shrink-0 opacity-70 transition group-hover:translate-x-1" />
      </Link>

      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2.5 px-1 text-sm font-bold uppercase tracking-wider text-muted">{g.title}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {g.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${g.tile} group relative flex min-h-28 flex-col justify-between overflow-hidden rounded-2xl p-4 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]`}
                >
                  <span className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10" />
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/20">
                    <Icon size={22} />
                  </span>
                  <span className="mt-3 text-base font-bold leading-tight">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      <div className="max-w-xs lg:hidden">
        <DisplayToggles />
      </div>
    </div>
  );
}
