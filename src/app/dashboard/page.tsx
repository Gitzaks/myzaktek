import { requireAuth } from "@/lib/auth-helpers";
import DashboardClient from "./DashboardClient";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";
import ServiceRecord from "@/models/ServiceRecord";

async function getDashboardStats(role: string, dealerIds: string[], regionId?: string) {
  await connectDB();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const contractFilter: Record<string, unknown> = { status: "active" };
  const serviceFilter: Record<string, unknown> = {
    scheduledDate: { $gte: startOfMonth },
    status: "scheduled",
  };

  if (role === "dealer" && dealerIds.length > 0) {
    contractFilter.dealerId = { $in: dealerIds };
    serviceFilter.dealerId = { $in: dealerIds };
  }

  const [activeCustomers, remindersThisMonth, monthlySales] = await Promise.all([
    Contract.countDocuments(contractFilter),
    ServiceRecord.countDocuments(serviceFilter),
    Contract.countDocuments({
      ...contractFilter,
      createdAt: { $gte: startOfMonth },
    }),
  ]);

  return { activeCustomers, remindersThisMonth, monthlySales };
}

export default async function DashboardPage() {
  const session = await requireAuth(["admin", "dealer", "regional"]);

  const stats = await getDashboardStats(
    session.user.role,
    session.user.dealerIds,
    session.user.regionId
  );

  return (
    <DashboardClient
      initialStats={stats}
      userRole={session.user.role}
      userDealerIds={session.user.dealerIds}
    />
  );
}
