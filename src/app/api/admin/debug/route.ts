import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import { readFile } from "fs/promises";
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
    ImportFile.find().sort({ createdAt: -1 }).limit(5).lean(),
  ]);

  // Read actual CSV headers from the most recent contracts import
  const contractsImport = recentImports.find(f => f.fileType === "contracts");
  let csvHeaders: string[] | null = null;
  let sampleRow: Record<string, string> | null = null;
  if (contractsImport?.storagePath) {
    try {
      const buffer = await readFile(contractsImport.storagePath);
      const text = buffer.toString("utf-8").slice(0, 4000); // just first ~4KB
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, preview: 2 });
      csvHeaders = parsed.meta.fields ?? [];
      sampleRow = parsed.data[0] ?? null;
    } catch {
      csvHeaders = ["(could not read file)"];
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
    csvHeaders,
    sampleRow,
  });
}
