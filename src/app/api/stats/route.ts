import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import Contract from "@/models/Contract";

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

  const dealerObjId = new mongoose.Types.ObjectId(dealerId);

  const [monthlyStats, activeCustomers, activeContracts, latestMonthStat, contractPriceAgg] = await Promise.all([
    DealerMonthlyStats.find({ dealerId, year }).sort({ month: 1 }).lean(),
    Contract.countDocuments({ dealerId, status: "active" }),
    // For Reminders This Month: walk each active contract's 6-month schedule
    Contract.find({ dealerId: dealerObjId, status: "active" }, { beginsAt: 1 }).lean(),
    // Monthly Sales: exteriorUnits from the most recent ZIE data for this dealer
    DealerMonthlyStats.findOne({ dealerId }, { "stats.exteriorUnits": 1 })
      .sort({ year: -1, month: -1 })
      .lean(),
    Contract.aggregate<{ avgSalePrice: number; avgInternalCost: number }>([
      {
        $match: {
          dealerId: dealerObjId,
          purchaseDate: { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) },
        },
      },
      {
        $group: {
          _id: null,
          avgSalePrice:    { $avg: { $cond: [{ $gt: ["$salePrice",    0] }, "$salePrice",    null] } },
          avgInternalCost: { $avg: { $cond: [{ $gt: ["$internalCost", 0] }, "$internalCost", null] } },
        },
      },
    ]),
  ]);

  // Reminders This Month — contracts with a 6-month anniversary in the current calendar month
  const currY = currentYear;
  const currM = new Date().getMonth(); // 0-based
  const loopCutoff = new Date(currY, currM + 1, 0); // last day of current month
  let remindersThisMonth = 0;
  for (const c of activeContracts) {
    const begin = new Date(c.beginsAt);
    const d = new Date(begin);
    while (d <= loopCutoff) {
      if (d > begin && d.getFullYear() === currY && d.getMonth() === currM) {
        remindersThisMonth++;
        break;
      }
      d.setMonth(d.getMonth() + 6);
    }
  }

  // Monthly Sales — exterior units from the most recent month with ZIE data
  const monthlySales = latestMonthStat?.stats.exteriorUnits ?? 0;

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

  const avgSalePrice    = Math.round(contractPriceAgg[0]?.avgSalePrice    ?? 0);
  const avgInternalCost = Math.round(contractPriceAgg[0]?.avgInternalCost ?? 0);
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
      avgPerContract: avgSalePrice,
      avgInternalCost,
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
