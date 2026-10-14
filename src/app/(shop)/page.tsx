import { DashboardScreen } from "@/components/DashboardScreen";
import { HomeMenu } from "@/components/HomeMenu";
import { readSession } from "@/lib/auth";

export default async function Page() {
  const user = await readSession();
  return <DashboardScreen menu={<HomeMenu role={user?.role || "kassir"} name={user?.name || ""} />} />;
}
