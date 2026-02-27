import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";
import ServiceRecord from "@/models/ServiceRecord";
import Vehicle from "@/models/Vehicle";
import User from "@/models/User";
import Dealer from "@/models/Dealer";

/**
 * POST /api/admin/migrate/wipe-import-data
 *
 * Removes all data written by broken contract imports, leaving only:
 *  - Admin / dealer / regional user accounts (role != "customer")
 *  - Dealers imported from the Dealer Master (email does NOT end with @dealers.zaktek.com)
 *
 * Safe to run before re-importing ZAKCNTRCTS so the DB starts clean.
 */
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const [contracts, serviceRecords, vehicles, customers, garbageDealers] = await Promise.all([
    Contract.deleteMany({}),
    ServiceRecord.deleteMany({}),
    Vehicle.deleteMany({}),
    User.deleteMany({ role: "customer" }),
    // Dealers auto-created by the contracts importer get a placeholder email like
    // zak0666@dealers.zaktek.com.  Dealers from the Dealer Master have a real email.
    Dealer.deleteMany({ email: { $regex: /@dealers\.zaktek\.com$/i } }),
  ]);

  return NextResponse.json({
    deleted: {
      contracts:      contracts.deletedCount,
      serviceRecords: serviceRecords.deletedCount,
      vehicles:       vehicles.deletedCount,
      customers:      customers.deletedCount,
      garbageDealers: garbageDealers.deletedCount,
    },
    message: "Done. Re-import Dealer Master first, then ZAKCNTRCTS.",
  });
}
