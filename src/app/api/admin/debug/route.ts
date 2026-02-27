import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Papa from "papaparse";
import Dealer from "@/models/Dealer";
import Contract from "@/models/Contract";
import User from "@/models/User";
import ImportFile from "@/models/ImportFile";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const [totalDealers, activeDealers, totalContracts, activeContracts, expiredContracts, cancelledContracts, totalCustomers, recentImports] = await Promise.all([
    Dealer.countDocuments(),
    Dealer.countDocuments({ active: true }),
    Contract.countDocuments(),
    Contract.countDocuments({ status: "active" }),
    Contract.countDocuments({ status: "expired" }),
    Contract.countDocuments({ status: "cancelled" }),
    User.countDocuments({ role: "customer" }),
    ImportFile.find().sort({ createdAt: -1 }).limit(5),
  ]);

  // Inspect the most recent import's fileData buffer
  const latestImport = recentImports[0];
  let fileDataInfo: Record<string, unknown> = { status: "no recent imports" };
  if (latestImport) {
    const fd = latestImport.fileData;
    if (!fd) {
      fileDataInfo = { status: "fileData is missing on document" };
    } else {
      const buf = Buffer.from(fd as Buffer);
      const text = buf.toString("utf-8").slice(0, 500);
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, preview: 3 });
      fileDataInfo = {
        bufferByteLength: buf.byteLength,
        first500chars: text,
        parsedHeaders: parsed.meta.fields ?? [],
        parsedRowCount: parsed.data.length,
        sampleRow: parsed.data[0] ?? null,
      };
    }
  }

  return NextResponse.json({
    dealers: { total: totalDealers, active: activeDealers },
    contracts: { total: totalContracts, active: activeContracts, expired: expiredContracts, cancelled: cancelledContracts },
    customers: totalCustomers,
    recentImports: recentImports.map(f => ({
      filename: f.filename,
      fileType: f.fileType,
      status: f.status,
      recordsImported: f.recordsImported,
      recordsTotal: f.recordsTotal,
      errorMessage: f.errorMessage,
      createdAt: f.createdAt,
    })),
    latestImportFileData: fileDataInfo,
  });
}
