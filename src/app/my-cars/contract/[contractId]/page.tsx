import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";
import Vehicle from "@/models/Vehicle";
import Dealer from "@/models/Dealer";
import User from "@/models/User";
import { getApplicationSchedule } from "@/lib/schedule";
import ContractInfoClient from "./ContractInfoClient";

export default async function ContractInfoPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const session = await requireAuth(["customer"]);
  const { contractId } = await params;

  await connectDB();

  const [contract, user] = await Promise.all([
    Contract.findOne({
      _id: contractId,
      customerId: session.user.id,
    }).lean(),
    User.findById(session.user.id).lean(),
  ]);

  if (!contract) notFound();
  if (!user) redirect("/login");

  const vehicle = contract.vin
    ? await Vehicle.findOne({ vin: contract.vin }).lean()
    : null;

  const dealer = await Dealer.findById(contract.dealerId).lean();
  if (!dealer) notFound();

  const schedule = getApplicationSchedule(contract.beginsAt, contract.endsAt).map((d) =>
    d.toISOString()
  );

  const nameParts = (user.name ?? "").trim().split(/\s+/);
  const firstName = nameParts.slice(0, -1).join(" ") || nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

  return (
    <ContractInfoClient
      user={{
        id: user._id.toString(),
        firstName,
        lastName,
        address: user.address ?? "",
        suiteApt: "",
        city: user.city ?? "",
        state: user.state ?? "",
        zip: user.zip ?? "",
        phone: user.phone ?? "",
        email: user.email,
      }}
      contract={{
        contractId: contract._id.toString(),
        vin: contract.vin ?? "",
        year: vehicle?.year ?? null,
        make: vehicle?.make ?? null,
        model: vehicle?.vehicleModel ?? null,
        agreementId: contract.agreementId,
        plan: contract.plan,
        planCode: contract.planCode ?? null,
        beginsAt: contract.beginsAt?.toISOString() ?? null,
        endsAt: contract.endsAt?.toISOString() ?? null,
        maxMileage: contract.maxMileage ?? null,
        beginMileage: contract.beginMileage ?? null,
        deductible: contract.deductible ?? 0,
        schedule,
      }}
      dealer={{
        id: dealer._id.toString(),
        name: dealer.name,
        city: dealer.city,
        state: dealer.state,
        logoUrl: dealer.logoUrl,
        serviceReminderPdfUrl: dealer.serviceReminderPdfUrl,
        fullWarrantyPdfUrl: dealer.fullWarrantyPdfUrl,
      }}
    />
  );
}
