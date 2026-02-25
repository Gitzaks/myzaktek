import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Vehicle from "@/models/Vehicle";
import Contract from "@/models/Contract";
import User from "@/models/User";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lastName, vinSuffix } = await req.json();
  const lastNameClean = lastName?.trim().toLowerCase() ?? "";
  const vinClean = vinSuffix?.trim().toUpperCase() ?? "";

  if (!lastNameClean || vinClean.length < 4) {
    return NextResponse.json({ error: "Last name and at least 4 VIN digits are required." }, { status: 400 });
  }

  await connectDB();

  // Find vehicles whose VIN ends with the provided suffix
  const vehicles = await Vehicle.find({
    vin: { $regex: `${vinClean}$`, $options: "i" },
  })
    .populate<{ customerId: { _id: string; name: string } }>("customerId", "name")
    .populate<{ dealerId: { _id: string; name: string } }>("dealerId", "name")
    .lean();

  // Filter by last name
  const matched = vehicles.filter((v) => {
    const custName: string = (v.customerId as { name?: string })?.name ?? "";
    const parts = custName.trim().split(/\s+/);
    const custLast = parts[parts.length - 1]?.toLowerCase() ?? "";
    return custLast === lastNameClean;
  });

  if (matched.length === 0) {
    // Fallback: search by Contract VIN + User last name
    const contracts = await Contract.find({
      vin: { $regex: `${vinClean}$`, $options: "i" },
    })
      .populate<{ customerId: { _id: string; name: string } }>("customerId", "name")
      .populate<{ dealerId: { _id: string; name: string } }>("dealerId", "name")
      .lean();

    const matchedContracts = contracts.filter((c) => {
      const custName: string = (c.customerId as { name?: string })?.name ?? "";
      const parts = custName.trim().split(/\s+/);
      const custLast = parts[parts.length - 1]?.toLowerCase() ?? "";
      return custLast === lastNameClean;
    });

    if (matchedContracts.length === 0) {
      return NextResponse.json({ result: null });
    }

    const c = matchedContracts[0];
    const dealer = c.dealerId as { name?: string } | null;
    return NextResponse.json({
      result: {
        contractId: c._id.toString(),
        vehicleId: null,
        vin: c.vin ?? "",
        year: null,
        make: null,
        model: null,
        dealerName: dealer?.name ?? "",
        plan: c.plan,
        beginsAt: c.beginsAt,
        endsAt: c.endsAt,
        agreementId: c.agreementId,
        alreadyClaimed: (c.customerId as { _id: { toString(): string } })?._id?.toString() === session.user.id,
      },
    });
  }

  const v = matched[0];
  // Find the associated contract
  const contract = await Contract.findOne({ vin: v.vin }).lean();
  const dealer = v.dealerId as { name?: string } | null;

  return NextResponse.json({
    result: {
      contractId: contract?._id?.toString() ?? null,
      vehicleId: v._id.toString(),
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.vehicleModel,
      color: v.color,
      dealerName: dealer?.name ?? "",
      plan: contract?.plan ?? null,
      beginsAt: contract?.beginsAt ?? null,
      endsAt: contract?.endsAt ?? null,
      agreementId: contract?.agreementId ?? null,
      alreadyClaimed: (v.customerId as { _id: { toString(): string } })?._id?.toString() === session.user.id,
    },
  });
}
