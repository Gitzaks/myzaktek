import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "regional", "dealer"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(500, parseInt(searchParams.get("limit") ?? "10"));
  const search = searchParams.get("search") ?? "";
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { active: true };

  if (session.user.role === "regional") {
    query.regionId = session.user.regionId;
  } else if (session.user.role === "dealer") {
    query._id = { $in: session.user.dealerIds };
  }

  if (search) {
    query.name = { $regex: search, $options: "i" };
  }

  const [rows, total] = await Promise.all([
    Dealer.find(query).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Dealer.countDocuments(query),
  ]);

  return NextResponse.json({ rows, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();

  const dealer = await Dealer.create(body);
  return NextResponse.json(dealer, { status: 201 });
}
