import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const serviceReminderPdfUrl = `data:application/pdf;base64,${base64}`;

  const dealer = await Dealer.findByIdAndUpdate(
    id,
    { $set: { serviceReminderPdfUrl } },
    { new: true }
  );
  if (!dealer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ serviceReminderPdfUrl });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { id } = await params;

  await Dealer.findByIdAndUpdate(id, { $unset: { serviceReminderPdfUrl: 1 } });
  return NextResponse.json({ ok: true });
}
