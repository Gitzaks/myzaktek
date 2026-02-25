import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { firstName, lastName, password, confirmPassword, address, city, state, zip, phone, email } =
    await req.json();

  const first = firstName?.trim() ?? "";
  const last = lastName?.trim() ?? "";
  if (!first && !last) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (password || confirmPassword) {
    if (password !== confirmPassword) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
  }

  await connectDB();

  const update: Record<string, string> = { name: `${first} ${last}`.trim() };
  if (address !== undefined) update.address = address;
  if (city !== undefined) update.city = city;
  if (state !== undefined) update.state = state;
  if (zip !== undefined) update.zip = zip;
  if (phone !== undefined) update.phone = phone;
  if (email !== undefined) update.email = email.toLowerCase().trim();

  if (password) {
    const user = await User.findById(session.user.id).select("+password");
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    Object.assign(user, update);
    user.password = password;
    await user.save();
    return NextResponse.json({ ok: true, name: user.name });
  }

  const user = await User.findByIdAndUpdate(
    session.user.id,
    { $set: update },
    { new: true }
  );
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ ok: true, name: user.name });
}
