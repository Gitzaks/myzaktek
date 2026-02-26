import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Contract from "@/models/Contract";
import Dealer from "@/models/Dealer";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const dealerId = searchParams.get("dealerId") ?? "";
  const search = searchParams.get("search") ?? "";
  const skip = (page - 1) * limit;

  // Build dealer filter based on role
  let allowedDealerIds: string[] = [];
  if (session.user.role === "admin") {
    // admin sees all — no dealer restriction unless filtered
  } else if (session.user.role === "regional") {
    // regional: get dealers in their region
    const dealers = await Dealer.find({ regionId: session.user.regionId, active: true }).select("_id");
    allowedDealerIds = dealers.map((d) => d._id.toString());
  } else if (session.user.role === "dealer") {
    allowedDealerIds = session.user.dealerIds;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build contract query
  const contractQuery: Record<string, unknown> = { status: "active" };
  if (dealerId) {
    contractQuery.dealerId = dealerId;
  } else if (allowedDealerIds.length > 0) {
    contractQuery.dealerId = { $in: allowedDealerIds };
  }

  // Build customer search filter
  let customerIds: string[] | null = null;
  if (search) {
    const customers = await User.find({
      role: "customer",
      $or: [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ],
    }).select("_id");
    customerIds = customers.map((c) => c._id.toString());
    contractQuery.customerId = { $in: customerIds };
  }

  const [contracts, total] = await Promise.all([
    Contract.find(contractQuery)
      .populate("customerId", "name email phone address city state zip")
      .populate("dealerId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Contract.countDocuments(contractQuery),
  ]);

  const rows = contracts.map((c) => {
    const customer = c.customerId as { name?: string; email?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string } | null;
    const dealer = c.dealerId as { name?: string } | null;
    const addrParts = [customer?.address, customer?.city, customer?.state].filter(Boolean);
    return {
      _id: c._id,
      agreementId: c.agreementId,
      customerName: customer?.name ?? "",
      customerPhone: customer?.phone ?? "",
      customerAddress: addrParts.join(", "),
      dealerName: dealer?.name ?? "",
      plan: c.plan,
      beginsAt: c.beginsAt,
      endsAt: c.endsAt,
      homeKit: c.homeKit,
      status: c.status,
    };
  });

  return NextResponse.json({ rows, total, page, limit });
}
