import { redirect } from "next/navigation";
import { LabelSheet } from "@/components/LabelSheet";
import { readSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Narx yorliqlari" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await readSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const { ids } = await searchParams;
  return <LabelSheet ids={(ids || "").split(",").map(Number).filter((n) => n > 0)} />;
}
