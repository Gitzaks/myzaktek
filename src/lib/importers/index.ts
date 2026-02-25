import { readFile } from "fs/promises";
import Papa from "papaparse";
import type { IImportFileDocument } from "@/models/ImportFile";
import { importMPP } from "./mppImporter";
import { importUnits } from "./unitsImporter";
import { importZIE } from "./zieImporter";
import { importBilling } from "./billingImporter";
import { importAutoPoint } from "./autopointImporter";
import { importContracts } from "./contractsImporter";

export interface ImportResult {
  recordsTotal: number;
  recordsImported: number;
}

export async function runImport(importFile: IImportFileDocument): Promise<ImportResult> {
  const buffer = await readFile(importFile.storagePath);
  const csvText = buffer.toString("utf-8");

  // All file types have a header row
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  }) as Papa.ParseResult<Record<string, string>>;

  const rows = parsed.data;

  switch (importFile.fileType) {
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
