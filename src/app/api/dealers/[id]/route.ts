import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";
import User from "@/models/User";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { id } = await params;

  const dealer = await Dealer.findById(id).lean();
  if (!dealer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const users = await User.find({ dealerIds: dealer._id })
    .select("name email role active")
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({ dealer, users });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "name", "address", "city", "state", "zip", "phone", "email",
    "serviceUrl", "unitsDealer", "dmeDealer", "billingDealer",
    "zieDealer", "zakCntrtsDealer", "whatToExpect", "active",
  ];

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  const dealer = await Dealer.findByIdAndUpdate(id, { $set: update }, { new: true });
  if (!dealer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ dealer });
}
