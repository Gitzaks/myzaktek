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

  // Mark as processing
  importFile.status = "processing";
  await importFile.save();

  try {
    const result = await runImport(importFile);
    importFile.status = "imported";
    importFile.recordsImported = result.recordsImported;
    importFile.recordsTotal = result.recordsTotal;
    importFile.errorMessage = undefined;
  } catch (err) {
    importFile.status = "import_failed";
    importFile.errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  await importFile.save();
  return NextResponse.json(importFile);
}
