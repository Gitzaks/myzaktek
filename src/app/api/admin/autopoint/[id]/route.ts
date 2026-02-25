import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import AutoPointExport from "@/models/AutoPointExport";
import { unlink } from "fs/promises";

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
  const record = await AutoPointExport.findById(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await unlink(record.storagePath);
  } catch {
    // file may already be gone
  }

  await AutoPointExport.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
