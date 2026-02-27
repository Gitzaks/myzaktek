import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { id } = await params;
  const importFile = await ImportFile.findById(id);
  if (!importFile) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Chunked uploads don't retain file data after the initial import.
  // The user must re-upload the file to import it again.
  if (!importFile.fileData && importFile.storagePath?.startsWith("mongodb-chunk:")) {
    return NextResponse.json(
      { error: "Re-import is not available for this file — please upload it again." },
      { status: 400 },
    );
  }

  // Reset status so the SSE stream route can pick it up immediately.
  importFile.status = "pending";
  importFile.processedRows = 0;
  await importFile.save();

  // Return the fileId. The client opens GET /api/admin/files/[id]/import/stream
  // which runs the actual import and streams live progress events.
  return NextResponse.json(
    { processing: true, fileId: String(importFile._id) },
    { status: 202 },
  );
}
