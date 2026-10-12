import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { readSession } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { som } from "@/lib/format";
import { licenseStatus } from "@/lib/license";
import { getCurrentBranch } from "@/lib/phase4";
import { OfflineBanner } from "@/components/OfflineBanner";
import { LicenseNotice } from "@/components/LicenseNotice";

export const dynamic = "force-dynamic";

const BANNER: Record<string, string> = {
  soon: "bg-amber-50 text-amber-900 border-amber-200",
  pending: "bg-amber-50 text-amber-900 border-amber-200",
  grace: "bg-orange-50 text-orange-900 border-orange-200",
  blocked: "bg-red-50 text-red-800 border-red-200",
};

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/parol");
  const settings = getSettings();
  const branch = getCurrentBranch();
  const license = licenseStatus();
  return (
    <Shell user={user} storeName={settings.store_name || "Do'kon"} branchName={branch?.name as string | undefined}>
      <OfflineBanner />
      {BANNER[license.code] ? (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${BANNER[license.code]}`}>
          {license.message}
          {license.pay ? (
            <div className="mt-1 font-normal">
              To‘lov: <span className="num font-semibold">{license.pay.card}</span>
              {license.pay.holder ? ` (${license.pay.holder})` : ""}
              {license.pay.amount ? ` · oylik ${som(license.pay.amount)}` : ""}
              {license.pay.phone ? ` · to‘lagach xabar bering: ${license.pay.phone}` : ""}
            </div>
          ) : null}
        </div>
      ) : null}
      {user.role === "admin" && BANNER[license.code] ? (
        <LicenseNotice code={license.code} message={license.message} pay={license.pay} />
      ) : null}
      {children}
    </Shell>
  );
}
