import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/db";

export async function GET() {
  try {
    const user = await requireUser();
    const data = getDashboard();
    if (user.role !== "admin") {
      return NextResponse.json({
        ...data,
        today: { sales: data.today.sales, count: data.today.count, profit: null, expenses: null, net: null },
        cash: null,
        payables: null,
      });
    }
    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e);
  }
}
