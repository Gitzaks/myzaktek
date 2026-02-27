import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";

/**
 * POST /api/admin/migrate/fix-dealer-names
 *
 * Finds every Dealer whose `name` equals its `dealerCode` (e.g. "ZAK0605")
 * and replaces it with the best available human-readable name, trying fields
 * in priority order: zakCntrtsDealer → billingDealer → dmeDealer → zieDealer → unitsDealer.
 *
 * Safe to run multiple times. Re-import your Contracts file first so that
 * zakCntrtsDealer is populated, then click this button.
 */
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  // All dealers still using their code as their display name
  const broken = await Dealer.find({
    $expr: { $eq: ["$name", "$dealerCode"] },
  }).lean();

  if (broken.length === 0) {
    return NextResponse.json({ fixed: 0, message: "No dealer names need fixing." });
  }

  const bulkOps = broken
    .map((d) => {
      // Try each name-bearing field in priority order; skip if it's also just the code
      const bestName =
        (d.zakCntrtsDealer && d.zakCntrtsDealer !== d.dealerCode ? d.zakCntrtsDealer : null) ??
        (d.billingDealer   && d.billingDealer   !== d.dealerCode ? d.billingDealer   : null) ??
        (d.dmeDealer       && d.dmeDealer       !== d.dealerCode ? d.dmeDealer       : null) ??
        (d.zieDealer       && d.zieDealer       !== d.dealerCode ? d.zieDealer       : null) ??
        (d.unitsDealer     && d.unitsDealer     !== d.dealerCode ? d.unitsDealer     : null) ??
        null;

      if (!bestName) return null;

      return {
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { name: bestName } },
        },
      };
    })
    .filter(Boolean);

  if (bulkOps.length === 0) {
    return NextResponse.json({
      fixed: 0,
      skipped: broken.length,
      message: `${broken.length} dealer(s) still need a name, but no replacement is available yet. Re-import your Contracts file, then run this again.`,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await Dealer.bulkWrite(bulkOps as any[]);

  const skipped = broken.length - bulkOps.length;
  return NextResponse.json({
    fixed: bulkOps.length,
    skipped,
    message: `Updated ${bulkOps.length} dealer name${bulkOps.length !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} still need a contracts re-import)` : ""}.`,
  });
}
