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

  // Prefer MongoDB-stored data; fall back to disk for legacy records
  let buffer: Buffer;
  if (record.fileData && record.fileData.length > 0) {
    buffer = Buffer.from(record.fileData);
  } else {
    try {
      buffer = await readFile(record.storagePath);
    } catch {
      return NextResponse.json({ error: "File data not available — please regenerate." }, { status: 404 });
    }
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${record.filename}"`,
    },
  });
}
