import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Vehicle from "@/models/Vehicle";
import Contract from "@/models/Contract";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const [vehicles, contracts] = await Promise.all([
    Vehicle.find({ customerId: session.user.id, removedByCustomer: { $ne: true } })
      .populate<{ dealerId: { name: string } }>("dealerId", "name")
      .lean(),
    Contract.find({ customerId: session.user.id })
      .populate<{ dealerId: { name: string } }>("dealerId", "name")
      .lean(),
  ]);

  // Merge: prefer vehicles (richer data), fall back to contracts
  const vinsSeen = new Set<string>();
  const rows: unknown[] = [];

  for (const v of vehicles) {
    vinsSeen.add(v.vin);
    const contract = contracts.find((c) => c.vin === v.vin);
    rows.push({
      vehicleId: v._id.toString(),
      contractId: contract?._id?.toString() ?? null,
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.vehicleModel,
      color: v.color,
      dealerName: (v.dealerId as { name?: string })?.name ?? "",
      plan: contract?.plan ?? null,
      status: contract?.status ?? null,
      beginsAt: contract?.beginsAt ?? null,
      endsAt: contract?.endsAt ?? null,
      agreementId: contract?.agreementId ?? null,
      warrantyExpiresAt: v.warrantyExpiresAt,
    });
  }

  // Contracts with no vehicle record
  for (const c of contracts) {
    if (c.vin && vinsSeen.has(c.vin)) continue;
    rows.push({
      vehicleId: null,
      contractId: c._id.toString(),
      vin: c.vin ?? "",
      year: null,
      make: null,
      model: null,
      color: null,
      dealerName: (c.dealerId as { name?: string })?.name ?? "",
      plan: c.plan,
      status: c.status,
      beginsAt: c.beginsAt,
      endsAt: c.endsAt,
      agreementId: c.agreementId,
      warrantyExpiresAt: null,
    });
  }

  return NextResponse.json({ rows });
}

// POST: claim a vehicle/contract by ID
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId, contractId } = await req.json();

  if (!vehicleId && !contractId) {
    return NextResponse.json({ error: "vehicleId or contractId required." }, { status: 400 });
  }

  await connectDB();

  const updates: Promise<unknown>[] = [];
  if (vehicleId) {
    updates.push(
      Vehicle.findByIdAndUpdate(vehicleId, { $set: { customerId: session.user.id } })
    );
  }
  if (contractId) {
    updates.push(
      Contract.findByIdAndUpdate(contractId, { $set: { customerId: session.user.id } })
    );
  }

  await Promise.all(updates);
  return NextResponse.json({ ok: true });
}
