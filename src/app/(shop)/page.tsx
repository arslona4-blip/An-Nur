import { DashboardScreen } from "@/components/DashboardScreen";
import { HomeMenu } from "@/components/HomeMenu";
import { readSession } from "@/lib/auth";

export default async function Page() {
  const user = await readSession();
  return (
    <div className="space-y-8">
      <HomeMenu role={user?.role || "kassir"} name={user?.name || ""} />
      <section>
        <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wider text-muted">Bugungi holat</h2>
        <DashboardScreen />
      </section>
    </div>
  );
}
