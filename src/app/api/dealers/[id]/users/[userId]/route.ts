import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { id, userId } = await params;

  await User.findByIdAndUpdate(userId, {
    $pull: { dealerIds: new mongoose.Types.ObjectId(id) },
  });

  return NextResponse.json({ ok: true });
}
