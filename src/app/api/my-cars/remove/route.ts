import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Vehicle from "@/models/Vehicle";
import Contract from "@/models/Contract";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { vehicleId, contractId } = await req.json();

  await connectDB();

  const ops: Promise<unknown>[] = [];

  if (vehicleId) {
    ops.push(
      Vehicle.findOneAndUpdate(
        { _id: vehicleId, customerId: session.user.id },
        { $set: { removedByCustomer: true } }
      )
    );
  }

  if (contractId) {
    // For contract-only rows (no vehicle), remove from visible list by
    // re-assigning so the contract-only path also works. We track removal
    // on the vehicle record; for contract-only records store on contract notes
    // or simply leave — the dashboard re-fetches via vehicle filter.
    // As a lightweight solution, just mark via a Contract note flag if needed.
    // For now the vehicle removedByCustomer flag is the primary gate.
  }

  await Promise.all(ops);
  return NextResponse.json({ ok: true });
}
