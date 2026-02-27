import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";

/**
 * POST /api/admin/migrate/fix-dealer-names
 *
 * One-time migration: for every Dealer whose `name` field equals its
 * `dealerCode` (e.g. "ZAK0605"), replace `name` with the `zakCntrtsDealer`
 * value (the human-readable name from the ZAKCNTRCTS report).
 *
 * Safe to run multiple times — only touches records that still have a
 * dealer-code-style name AND have a zakCntrtsDealer value to replace it with.
 */
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  // Find every dealer whose name still looks like a dealer code
  const broken = await Dealer.find({
    $expr: { $eq: ["$name", "$dealerCode"] },
    zakCntrtsDealer: { $exists: true, $ne: "" },
  }).lean();

  if (broken.length === 0) {
    return NextResponse.json({ fixed: 0, message: "No dealer names need fixing." });
  }

  const bulkOps = broken.map((d) => ({
    updateOne: {
      filter: { _id: d._id },
      update: { $set: { name: d.zakCntrtsDealer } },
    },
  }));

  await Dealer.bulkWrite(bulkOps);

  return NextResponse.json({
    fixed: broken.length,
    message: `Updated ${broken.length} dealer name${broken.length !== 1 ? "s" : ""}.`,
  });
}
