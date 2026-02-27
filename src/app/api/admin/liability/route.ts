import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();

  // Only active contracts with a future expiration date
  const contracts = await Contract.find(
    { status: "active", endsAt: { $gte: now } },
    { endsAt: 1, _id: 0 }
  ).lean();

  // Group by expiration year-month (YYYY-MM)
  const groups: Record<string, number> = {};
  for (const c of contracts) {
    const d = new Date(c.endsAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    groups[key] = (groups[key] ?? 0) + 1;
  }

  const periods = Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }));

  return NextResponse.json({ total: contracts.length, periods });
}
