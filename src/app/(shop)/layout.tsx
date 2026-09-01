import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { readSession } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { getCurrentBranch } from "@/lib/phase4";
import { OfflineBanner } from "@/components/OfflineBanner";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/login");
  const settings = getSettings();
  const branch = getCurrentBranch();
  return (
    <Shell user={user} storeName={settings.store_name || "Do'kon"} branchName={branch?.name as string | undefined}>
      <OfflineBanner />
      {children}
    </Shell>
  );
}
