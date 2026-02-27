import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = await req.json();
  const { firstName, lastName, email, password, role, dealerIds } = body as {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    role: "customer" | "dealer" | "admin";
    dealerIds?: string[];
  };

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !password || !role) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (!["customer", "dealer", "admin"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (role === "dealer" && (!dealerIds || dealerIds.length === 0)) {
    return NextResponse.json({ error: "At least one dealership must be assigned for a Dealer user" }, { status: 400 });
  }

  const existing = await User.findOne({ email: email.trim().toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const user = await User.create({
    name: `${firstName.trim()} ${lastName.trim()}`,
    email: email.trim().toLowerCase(),
    password,
    role,
    dealerIds: role === "dealer"
      ? dealerIds!.map((id) => new mongoose.Types.ObjectId(id))
      : [],
    active: true,
  });

  return NextResponse.json({ id: user._id, name: user.name, email: user.email, role: user.role }, { status: 201 });
}
