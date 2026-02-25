import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import AutoPointExport from "@/models/AutoPointExport";
import { readFile } from "fs/promises";

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
  const record = await AutoPointExport.findById(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const buffer = await readFile(record.storagePath);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${record.filename}"`,
    },
  });
}
