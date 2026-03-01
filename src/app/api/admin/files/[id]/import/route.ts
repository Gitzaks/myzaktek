import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import { inngest } from "@/inngest/client";

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
  if (!importFile.fileData && importFile.storagePath?.startsWith("mongodb-chunk:")) {
    return NextResponse.json(
      { error: "Re-import is not available for this file — please upload it again." },
      { status: 400 },
    );
  }

  if (importFile.fileType === "contracts") {
    // Contracts are processed by Inngest in the background — no Vercel timeout.
    // The client will fall back to 5-second DB polling for progress updates.
    importFile.status        = "processing";
    importFile.processedRows = 0;
    importFile.statusMessage = "Queued…";
    await importFile.save();

    await inngest.send({
      name: "import/requested",
      data: { fileId: String(importFile._id) },
    });

    return NextResponse.json(
      { processing: true, fileId: String(importFile._id) },
      { status: 202 },
    );
  }

  // All other file types use the existing SSE stream route.
  importFile.status        = "pending";
  importFile.processedRows = 0;
  await importFile.save();

  return NextResponse.json(
    { processing: true, fileId: String(importFile._id) },
    { status: 202 },
  );
}
