import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import Contract from "@/models/Contract";
import ServiceRecord from "@/models/ServiceRecord";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "dealer", "regional"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const dealerId = searchParams.get("dealerId");
  const currentYear = new Date().getFullYear();
  const yearParam = searchParams.get("year");
  const year = yearParam ? parseInt(yearParam) : currentYear;

  // Enforce dealer-scoped access
  if (session.user.role === "dealer" && dealerId && !session.user.dealerIds.includes(dealerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!dealerId) {
    return NextResponse.json({ error: "dealerId is required" }, { status: 400 });
  }

  const [monthlyStats, activeCustomers, remindersThisMonth, monthlySales] = await Promise.all([
    DealerMonthlyStats.find({ dealerId, year }).sort({ month: 1 }).lean(),
    Contract.countDocuments({ dealerId, status: "active" }),
    ServiceRecord.countDocuments({
      dealerId,
      scheduledDate: {
        $gte: new Date(currentYear, new Date().getMonth(), 1),
      },
      status: "scheduled",
    }),
    Contract.countDocuments({
      dealerId,
      purchaseDate: {
        $gte: new Date(currentYear, new Date().getMonth(), 1),
      },
    }),
  ]);

  // Aggregate YTD totals from monthly stats
  const ytd = monthlyStats.reduce(
    (acc, m) => {
      acc.totalRevenue += m.stats.totalRevenue ?? 0;
      acc.exteriorUnits += m.stats.exteriorUnits ?? 0;
      acc.interiorUnits += m.stats.interiorUnits ?? 0;
      acc.newUnits += m.stats.newUnits ?? 0;
      acc.ROs += m.stats.ROs ?? 0;
      acc.fixedOpsRevenue += m.stats.fixedOpsRevenue ?? 0;
      acc.list += m.stats.list ?? 0;
      acc.response += m.stats.response ?? 0;
      return acc;
    },
    { totalRevenue: 0, exteriorUnits: 0, interiorUnits: 0, newUnits: 0, ROs: 0, fixedOpsRevenue: 0, list: 0, response: 0 }
  );

  const avgRevenue =
    ytd.exteriorUnits > 0 ? Math.round(ytd.totalRevenue / ytd.exteriorUnits) : 0;
  const responseRate =
    ytd.list > 0 ? Math.round((ytd.response / ytd.list) * 100) / 100 : 0;
  const avgROTotalPay =
    ytd.ROs > 0 ? Math.round(ytd.fixedOpsRevenue / ytd.ROs) : 0;

  const totalUnitsYTD = monthlyStats.reduce((a, m) => a + (m.stats.units ?? 0), 0);
  const exteriorPenetrationAvg =
    totalUnitsYTD > 0 ? Math.round((ytd.exteriorUnits / totalUnitsYTD) * 100) : 0;
  const interiorPenetrationAvg =
    totalUnitsYTD > 0 ? Math.round((ytd.interiorUnits / totalUnitsYTD) * 100) : 0;

  return NextResponse.json({
    summary: {
      activeCustomers,
      remindersThisMonth,
      monthlySales,
      totalImpactYTD: ytd.totalRevenue,
      salesYTD: ytd.newUnits,
      avgPerContract: avgRevenue,
      contractRevenueYTD: ytd.totalRevenue,
      exteriorPenetration: exteriorPenetrationAvg,
      interiorPenetration: interiorPenetrationAvg,
      ROsYTD: ytd.ROs,
      avgROPay: avgROTotalPay,
      totalRORevenueYTD: ytd.fixedOpsRevenue,
      responseRate,
    },
    monthly: monthlyStats.map((m) => ({
      month: m.month,
      year: m.year,
      stats: m.stats,
    })),
  });
}
