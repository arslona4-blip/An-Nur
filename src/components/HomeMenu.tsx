import Link from "next/link";
import { ChevronRight, ShoppingCart } from "lucide-react";
import { DisplayToggles } from "@/components/DisplayPrefs";
import { menuFor, PANEL_LINKS } from "@/lib/menu";

export function HomeMenu({ role, name }: { role: string; name: string }) {
  const groups = menuFor(role);
  const panel = PANEL_LINKS.filter((l) => l.roles.includes(role));
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

      <div className="space-y-3">
        {groups.map((g) => (
          <section key={g.title} className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-3">
            <h2 className="px-1 text-sm font-bold uppercase tracking-wider text-muted md:flex md:w-28 md:shrink-0 md:items-center md:px-0 md:text-xs">
              {g.title}
            </h2>
            <div className="flex flex-1 gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-[repeat(4,170px)] md:overflow-visible md:pb-0">
              {g.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${g.tile} relative flex min-h-24 min-w-[112px] shrink-0 flex-col md:min-w-0 justify-between overflow-hidden rounded-2xl p-3 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]`}
                  >
                    <span className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-white/10" />
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20">
                      <Icon size={20} />
                    </span>
                    <span className="mt-2 text-sm font-bold leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {panel.length ? (
        <section className="md:hidden">
          <h2 className="mb-2.5 px-1 text-sm font-bold uppercase tracking-wider text-muted">Boshqaruv</h2>
          <div className="grid grid-cols-2 gap-3">
            {panel.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-20 items-center gap-3 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 p-4 font-bold text-white shadow-md"
                >
                  <Icon size={22} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="max-w-xs md:hidden">
        <DisplayToggles />
      </div>
    </div>
  );
}
