import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import Dealer from "@/models/Dealer";
import Contract from "@/models/Contract";
import User from "@/models/User";
import ImportFile from "@/models/ImportFile";
import ChunkBuffer from "@/models/ChunkBuffer";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const [totalDealers, activeDealers, totalContracts, activeContracts, expiredContracts, cancelledContracts, totalCustomers, recentImports, sampleContracts] = await Promise.all([
    Dealer.countDocuments(),
    Dealer.countDocuments({ active: true }),
    Contract.countDocuments(),
    Contract.countDocuments({ status: "active" }),
    Contract.countDocuments({ status: "expired" }),
    Contract.countDocuments({ status: "cancelled" }),
    User.countDocuments({ role: "customer" }),
    ImportFile.find().sort({ createdAt: -1 }).limit(5),
    // Sample newest 5 contracts so we can inspect status, dealerId, agreementId
    Contract.find().sort({ createdAt: -1 }).limit(5)
      .select("agreementId status dealerId customerId beginsAt endsAt purchaseDate")
      .populate("dealerId", "name dealerCode")
      .lean(),
  ]);

  // Inspect the most recent import's file buffer (works for both direct
  // fileData uploads and chunked uploads stored in ChunkBuffer).
  const latestImport = recentImports[0];
  let fileDataInfo: Record<string, unknown> = { status: "no recent imports" };
  if (latestImport) {
    let buf: Buffer | null = null;

    if (latestImport.fileData) {
      buf = Buffer.from(latestImport.fileData as Buffer);
    } else if (latestImport.storagePath?.startsWith("mongodb-chunk:")) {
      const uploadId = latestImport.storagePath.replace("mongodb-chunk:", "");
      const chunks = await ChunkBuffer.find({ uploadId }).sort({ chunkIndex: 1 });
      if (chunks.length > 0) {
        buf = Buffer.concat(chunks.map((c) => c.data));
      }
    }

    if (!buf) {
      fileDataInfo = {
        status: "file data unavailable (chunked upload already consumed or file data missing)",
        filename: latestImport.filename,
        storagePath: latestImport.storagePath,
      };
    } else {
      const isXlsx = latestImport.filename?.toLowerCase().match(/\.xlsx?$/);
      if (isXlsx) {
        try {
          const wb = XLSX.read(buf, { type: "buffer" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
          const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
          fileDataInfo = {
            bufferByteLength: buf.byteLength,
            format: "xlsx",
            sheetName: wb.SheetNames[0],
            parsedHeaders: headers,
            parsedRowCount: rows.length,
            sampleRow: rows[0] ?? null,
          };
        } catch (e) {
          fileDataInfo = { status: "xlsx parse error", error: String(e) };
        }
      } else {
        const text = buf.toString("utf-8").slice(0, 500);
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          delimiter: text.includes("|") ? "|" : ",",
          preview: 3,
        });
        fileDataInfo = {
          bufferByteLength: buf.byteLength,
          format: "csv",
          first500chars: text,
          parsedHeaders: parsed.meta.fields ?? [],
          parsedRowCount: parsed.data.length,
          sampleRow: parsed.data[0] ?? null,
        };
      }
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
      importErrors: f.importErrors,
      createdAt: f.createdAt,
    })),
    latestImportFileData: fileDataInfo,
    sampleContracts,
  });
}
