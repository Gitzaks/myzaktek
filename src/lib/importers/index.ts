import { readFile } from "fs/promises";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { IImportFileDocument } from "@/models/ImportFile";
import { importMPP } from "./mppImporter";
import { importUnits } from "./unitsImporter";
import { importZIE } from "./zieImporter";
import { importBilling } from "./billingImporter";
import { importAutoPoint } from "./autopointImporter";
import { importContracts } from "./contractsImporter";
import { importDealers } from "./dealersImporter";

export interface ImportResult {
  recordsTotal: number;
  recordsImported: number;
  errors?: string[];
}

export async function runImport(importFile: IImportFileDocument, inMemoryBuffer?: Buffer): Promise<ImportResult> {
  // Use the provided buffer, then the persisted fileData, then fall back to reading from disk
  const buffer = inMemoryBuffer ?? (importFile.fileData ? Buffer.from(importFile.fileData) : await readFile(importFile.storagePath));
  const isExcel = importFile.filename.toLowerCase().endsWith(".xlsx");

  const rows: Record<string, string>[] = [];

  if (isExcel) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    for (const row of rawRows) {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        const k = key.trim().toLowerCase().replace(/[\s\-]+/g, "_");
        normalized[k] = String(value);
      }
      rows.push(normalized);
    }
  } else {
    const csvText = buffer.toString("utf-8").replace(/^\uFEFF/, "");
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    }) as Papa.ParseResult<Record<string, string>>;
    for (const row of parsed.data) {
      const normalized: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        const k = key.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
        normalized[k] = value as string;
      }
      rows.push(normalized);
    }
  }

  switch (importFile.fileType) {
    case "dealers":
      return importDealers(rows);
    case "contracts":
      return importContracts(rows);
    case "mpp":
      return importMPP(rows);
    case "units":
      return importUnits(rows, importFile.year!, importFile.month!);
    case "zie":
      return importZIE(rows, importFile.year!, importFile.month!);
    case "billing":
      return importBilling(rows, importFile.year!, importFile.month!);
    case "autopoint":
      return importAutoPoint(rows, importFile.year!, importFile.month!);
    default:
      throw new Error(`Unknown file type: ${importFile.fileType}`);
  }
}
