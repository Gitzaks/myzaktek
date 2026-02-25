import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { connectDB } from "@/lib/mongodb";
import Vehicle from "@/models/Vehicle";
import Contract from "@/models/Contract";
import User from "@/models/User";
import Dealer from "@/models/Dealer";
import { getApplicationSchedule } from "@/lib/schedule";
import MyCarsDashboard from "./MyCarsDashboard";

export default async function MyCarsPage() {
  const session = await requireAuth(["customer"]);
  await connectDB();

  const [user, vehicles, contracts] = await Promise.all([
    User.findById(session.user.id).lean(),
    Vehicle.find({ customerId: session.user.id, removedByCustomer: { $ne: true } })
      .lean(),
    Contract.find({ customerId: session.user.id }).lean(),
  ]);

  if (!user) redirect("/login");

  // If no cars, redirect to add page
  if (vehicles.length === 0 && contracts.length === 0) {
    redirect("/my-cars/add");
  }

  // Build unified car rows
  const vinsSeen = new Set<string>();
  const dealerIds = new Set<string>();
  type CarRow = {
    vehicleId: string | null;
    contractId: string | null;
    vin: string;
    year: number | null;
    make: string | null;
    model: string | null;
    dealerId: string;
    plan: string | null;
    status: string | null;
    beginsAt: string | null;
    endsAt: string | null;
    agreementId: string | null;
    planCode: string | null;
    maxMileage: number | null;
    beginMileage: number | null;
    deductible: number;
    schedule: string[];
  };
  const rows: CarRow[] = [];

  for (const v of vehicles) {
    vinsSeen.add(v.vin);
    const contract = contracts.find((c) => c.vin === v.vin);
    const dId = (contract?.dealerId ?? v.dealerId).toString();
    dealerIds.add(dId);
    const beginsAt = contract?.beginsAt ?? null;
    const endsAt = contract?.endsAt ?? null;
    const schedule =
      beginsAt && endsAt
        ? getApplicationSchedule(beginsAt, endsAt).map((d) => d.toISOString())
        : [];
    rows.push({
      vehicleId: v._id.toString(),
      contractId: contract?._id?.toString() ?? null,
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.vehicleModel,
      dealerId: dId,
      plan: contract?.plan ?? null,
      status: contract?.status ?? null,
      beginsAt: beginsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      agreementId: contract?.agreementId ?? null,
      planCode: contract?.planCode ?? null,
      maxMileage: contract?.maxMileage ?? null,
      beginMileage: contract?.beginMileage ?? null,
      deductible: contract?.deductible ?? 0,
      schedule,
    });
  }

  // Contracts with no vehicle record
  for (const c of contracts) {
    if (c.vin && vinsSeen.has(c.vin)) continue;
    const dId = c.dealerId.toString();
    dealerIds.add(dId);
    const schedule = getApplicationSchedule(c.beginsAt, c.endsAt).map((d) =>
      d.toISOString()
    );
    rows.push({
      vehicleId: null,
      contractId: c._id.toString(),
      vin: c.vin ?? "",
      year: null,
      make: null,
      model: null,
      dealerId: dId,
      plan: c.plan,
      status: c.status,
      beginsAt: c.beginsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      agreementId: c.agreementId,
      planCode: c.planCode ?? null,
      maxMileage: c.maxMileage ?? null,
      beginMileage: c.beginMileage ?? null,
      deductible: c.deductible ?? 0,
      schedule,
    });
  }

  // Fetch dealers
  const dealers = await Dealer.find({ _id: { $in: [...dealerIds] } }).lean();
  const dealerMap: Record<string, {
    name: string; address: string; city: string; state: string;
    zip: string; phone: string; serviceUrl?: string; logoUrl?: string;
    serviceReminderPdfUrl?: string; fullWarrantyPdfUrl?: string;
  }> = {};
  for (const d of dealers) {
    dealerMap[d._id.toString()] = {
      name: d.name,
      address: d.address,
      city: d.city,
      state: d.state,
      zip: d.zip,
      phone: d.phone,
      serviceUrl: d.serviceUrl,
      logoUrl: d.logoUrl,
      serviceReminderPdfUrl: d.serviceReminderPdfUrl,
      fullWarrantyPdfUrl: d.fullWarrantyPdfUrl,
    };
  }

  const nameParts = (user.name ?? "").trim().split(/\s+/);
  const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  return (
    <MyCarsDashboard
      user={{
        id: user._id.toString(),
        name: user.name,
        firstName,
        lastName,
        address: user.address ?? "",
        city: user.city ?? "",
        state: user.state ?? "",
        zip: user.zip ?? "",
        phone: user.phone ?? "",
        email: user.email,
      }}
      cars={rows}
      dealerMap={dealerMap}
    />
  );
}
