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

  if (importFile.fileType === "contracts") {
    // Processed by Inngest in the background — no Vercel timeout.
    // Inngest step 1 will fail gracefully if file data is unavailable.
    // The client falls back to 5-second DB polling for progress updates.
    importFile.status        = "processing";
    importFile.processedRows = 0;
    importFile.statusMessage = "Queued…";
    await importFile.save();

    try {
      await inngest.send({
        name: "import/requested",
        data: { fileId: String(importFile._id) },
      });
    } catch (err) {
      importFile.status = "import_failed";
      importFile.errorMessage = `Failed to queue import: ${err instanceof Error ? err.message : String(err)}`;
      await importFile.save();
      return NextResponse.json(
        { error: importFile.errorMessage },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { processing: true, fileId: String(importFile._id) },
      { status: 202 },
    );
  }

  // All other file types use the SSE stream route.
  // Chunked uploads don't retain data after the initial import — block re-imports.
  if (!importFile.fileData && importFile.storagePath?.startsWith("mongodb-chunk:")) {
    return NextResponse.json(
      { error: "Re-import is not available for this file — please upload it again." },
      { status: 400 },
    );
  }

  importFile.status        = "pending";
  importFile.processedRows = 0;
  await importFile.save();

  return NextResponse.json(
    { processing: true, fileId: String(importFile._id) },
    { status: 202 },
  );
}
