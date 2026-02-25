import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: Request) {
  const { firstName, lastName, email, password } = await req.json();

  const first = firstName?.trim() ?? "";
  const last = lastName?.trim() ?? "";
  const emailClean = email?.trim().toLowerCase() ?? "";

  if (!first || !last || !emailClean || !password) {
    return NextResponse.json({ error: "All fields are required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  await connectDB();

  const existing = await User.findOne({ email: emailClean });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  await User.create({
    name: `${first} ${last}`,
    email: emailClean,
    password,
    role: "customer",
    active: true,
  });

  return NextResponse.json({ ok: true });
}
