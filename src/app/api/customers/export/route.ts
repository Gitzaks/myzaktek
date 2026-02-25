import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";
import Dealer from "@/models/Dealer";
import Papa from "papaparse";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "dealer", "regional"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const dealerId = searchParams.get("dealerId") ?? "";

  const query: Record<string, unknown> = { status: "active" };

  if (session.user.role === "dealer") {
    query.dealerId = { $in: session.user.dealerIds };
  } else if (dealerId) {
    query.dealerId = dealerId;
  }

  const contracts = await Contract.find(query)
    .populate("customerId", "name email phone address city state zip")
    .populate("dealerId", "name dealerCode")
    .sort({ createdAt: -1 })
    .limit(50000)
    .lean();

  const rows = contracts.map((c) => {
    const customer = c.customerId as unknown as Record<string, string> | null;
    const dealer = c.dealerId as unknown as Record<string, string> | null;
    return {
      Name: customer?.name ?? "",
      Address: customer?.address ?? "",
      City: customer?.city ?? "",
      State: customer?.state ?? "",
      Zip: customer?.zip ?? "",
      Phone: customer?.phone ?? "",
      Email: customer?.email ?? "",
      Agreement: c.agreementId,
      Plan: c.plan,
      Dealer: dealer?.name ?? "",
      DealerCode: dealer?.dealerCode ?? "",
      Begins: c.beginsAt ? new Date(c.beginsAt).toLocaleDateString() : "",
      Ends: c.endsAt ? new Date(c.endsAt).toLocaleDateString() : "",
      HomeKit: c.homeKit ? "Yes" : "No",
      Status: c.status,
    };
  });

  const csv = Papa.unparse(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
