import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import { runImport } from "@/lib/importers";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  // Chunked uploads are not retained after the initial import — file data is
  // processed in-memory and discarded. Re-import requires re-uploading the file.
  if (!importFile.fileData && importFile.storagePath?.startsWith("mongodb-chunk:")) {
    return NextResponse.json(
      { error: "Re-import is not available for this file — please upload it again." },
      { status: 400 }
    );
  }

  // Mark as processing immediately and respond 202 so the UI doesn't hang.
  importFile.status = "processing";
  importFile.processedRows = 0;
  await importFile.save();

  after(async () => {
    await connectDB();

    let lastProgressSave = Date.now();

    try {
      const result = await runImport(importFile, undefined, async (processed, total) => {
        importFile.processedRows = processed;
        if (!importFile.recordsTotal) importFile.recordsTotal = total;
        // Throttle DB writes to at most once every 2 seconds to avoid hammering Mongo.
        if (Date.now() - lastProgressSave >= 2000) {
          await importFile.save();
          lastProgressSave = Date.now();
        }
      });

      importFile.status = "imported";
      importFile.recordsImported = result.recordsImported;
      importFile.recordsTotal = result.recordsTotal;
      importFile.processedRows = result.recordsTotal;
      importFile.importErrors = result.errors ?? [];
      if (result.errors && result.errors.length > 0) {
        importFile.errorMessage = `${result.errors.length} row(s) failed`;
      } else {
        importFile.errorMessage = undefined;
      }
    } catch (err) {
      importFile.status = "import_failed";
      importFile.errorMessage = err instanceof Error ? err.message : "Unknown error";
    }

    await importFile.save();
  });

  return NextResponse.json(
    { processing: true, fileId: String(importFile._id) },
    { status: 202 }
  );
}
