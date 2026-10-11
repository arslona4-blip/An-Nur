import { StaffScreen } from "@/components/StaffScreen";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { parol } = await searchParams;
  return <StaffScreen weakPassword={parol === "1"} />;
}
