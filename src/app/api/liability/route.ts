import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";
import { getApplicationSchedule } from "@/lib/schedule";

/**
 * GET /api/liability
 *
 * For every active contract, walks its 6-month application schedule (skipping
 * month-0 — the purchase date) and counts how many dates are strictly after
 * today.  Returns:
 *
 *  buckets             — { [remaining: number]: customerCount }
 *  totalCustomers      — customers with 1+ remaining notifications
 *  totalNotifications  — sum of (n × count) across all buckets
 *  twelveMonthNotifications — notifications due > today and <= today + 12 mo
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "dealer", "regional"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const allActive = await Contract.find(
    { status: "active" },
    { beginsAt: 1, endsAt: 1 }
  ).lean();

  const today          = new Date();
  const twelveMonthsOut = new Date(today.getFullYear(), today.getMonth() + 12, today.getDate());

  const buckets: Record<number, number> = {};
  let totalCustomers         = 0;
  let totalNotifications     = 0;
  let twelveMonthNotifications = 0;

  for (const c of allActive) {
    // All application dates, skipping index 0 (purchase date / month-0)
    const allDates    = getApplicationSchedule(new Date(c.beginsAt), new Date(c.endsAt));
    const futureDates = allDates.slice(1).filter((d) => d > today);

    const remaining = futureDates.length;
    if (remaining === 0) continue;

    buckets[remaining] = (buckets[remaining] ?? 0) + 1;
    totalCustomers++;
    totalNotifications += remaining;
    twelveMonthNotifications += futureDates.filter((d) => d <= twelveMonthsOut).length;
  }

  return NextResponse.json({ buckets, totalCustomers, totalNotifications, twelveMonthNotifications });
}
