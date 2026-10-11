import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { PasswordScreen } from "@/components/PasswordScreen";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await readSession();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/");
  return <PasswordScreen name={user.name} username={user.username} />;
}
