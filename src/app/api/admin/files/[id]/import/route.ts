import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import { runImport } from "@/lib/importers";

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

  // Mark as processing
  importFile.status = "processing";
  await importFile.save();

  try {
    const result = await runImport(importFile);
    importFile.status = "imported";
    importFile.recordsImported = result.recordsImported;
    importFile.recordsTotal = result.recordsTotal;
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
  return NextResponse.json(importFile);
}
