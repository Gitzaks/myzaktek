import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import AutoPointExport from "@/models/AutoPointExport";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const exports = await AutoPointExport.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ exports });
}
