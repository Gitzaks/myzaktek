import { requireAuth } from "@/lib/auth-helpers";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";
import StatsClient from "./StatsClient";

async function getDealers(role: string, dealerIds: string[], regionId?: string) {
  await connectDB();
  const query: Record<string, unknown> = { active: true };
  if (role === "dealer") query._id = { $in: dealerIds };
  else if (role === "regional") query.regionId = regionId;
  return Dealer.find(query).sort({ name: 1 }).select("_id name dealerCode").lean();
}

export default async function StatsPage() {
  const session = await requireAuth(["admin", "dealer", "regional"]);
  const dealers = await getDealers(
    session.user.role,
    session.user.dealerIds,
    session.user.regionId
  );

  return (
    <StatsClient
      dealers={dealers.map((d) => ({ _id: d._id.toString(), name: d.name, dealerCode: d.dealerCode }))}
      userRole={session.user.role}
      isAdmin={session.user.role === "admin"}
    />
  );
}
