import { readFile } from "fs/promises";
import Papa from "papaparse";
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
  // Strip UTF-8 BOM if present — common in Windows/Excel CSV exports
  const csvText = buffer.toString("utf-8").replace(/^\uFEFF/, "");

  // All file types have a header row
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  }) as Papa.ParseResult<Record<string, string>>;

  // Normalize all column headers to lowercase_underscore so importers
  // work regardless of whether the CSV uses "Dealer Code", "dealer_code",
  // "DEALER_CODE", etc.  Also strip any stray BOM on the first key.
  const rows = parsed.data.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const k = key.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
      normalized[k] = value as string;
    }
    return normalized;
  });

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
