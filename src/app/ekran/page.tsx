import { redirect } from "next/navigation";
import { CustomerDisplay } from "@/components/CustomerDisplay";
import { readSession } from "@/lib/auth";
import { getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Xaridor ekrani" };

export default async function Page() {
  const user = await readSession();
  if (!user) redirect("/login");
  const settings = getSettings();
  return <CustomerDisplay storeName={settings.store_name || "Do'kon"} footer={settings.receipt_footer || ""} />;
}
