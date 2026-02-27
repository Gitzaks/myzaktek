import { readFile } from "fs/promises";
import { Readable } from "stream";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { IImportFileDocument } from "@/models/ImportFile";
import { importMPP } from "./mppImporter";
import { importUnits } from "./unitsImporter";
import { importZIE } from "./zieImporter";
import { importBilling } from "./billingImporter";
import { importAutoPoint } from "./autopointImporter";
import { importContracts } from "./contractsImporter";
import { importDealers, importAutoPointRollup } from "./dealersImporter";

export interface ImportResult {
  recordsTotal: number;
  recordsImported: number;
  errors?: string[];
}

export type ProgressFn = (processed: number, total: number, message?: string) => Promise<void>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeExcelSheet(ws: XLSX.WorkSheet): Record<string, string>[] {
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return rawRows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const k = key.trim().toLowerCase().replace(/[\s\-]+/g, "_");
      normalized[k] = String(value);
    }
    return normalized;
  });
}

/**
 * Like normalizeExcelSheet but scans the first 10 rows for the real header row.
 * AutoPoint files have title/subtitle rows above the actual column headers, so
 * we look for the first row containing a cell that starts with "dme".
 */
function normalizeAutoPointSheet(ws: XLSX.WorkSheet): Record<string, string>[] {
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  let headerIdx = 0;
  for (let i = 0; i < Math.min(10, raw.length); i++) {
    if ((raw[i] as unknown[]).some((c) => /^dme\b|^dealer\b/i.test(String(c).trim()))) {
      headerIdx = i;
      break;
    }
  }

  const headers = (raw[headerIdx] as unknown[]).map((h) =>
    String(h).trim().toLowerCase().replace(/[\s\-]+/g, "_")
  );

  return raw
    .slice(headerIdx + 1)
    .filter((row) => (row as unknown[]).some((c) => String(c).trim() !== ""))
    .map((row) => {
      const out: Record<string, string> = {};
      (row as unknown[]).forEach((cell, i) => { if (headers[i]) out[headers[i]] = String(cell); });
      return out;
    });
}

const MONTH_FULL  = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTH_ABBR  = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

/**
 * Parse month + year from an Excel sheet tab name.
 * Handles: "January 2025", "Jan 2025", "January", "Jan", "1", "01", "1/2025".
 * Falls back to `fallbackYear` when no year is present in the name.
 */
function parseSheetDate(name: string, fallbackYear?: number): { year: number; month: number } | null {
  const lower = name.trim().toLowerCase();

  let month: number | null = null;
  for (let i = 0; i < MONTH_FULL.length; i++) {
    if (lower.includes(MONTH_FULL[i]) || lower.includes(MONTH_ABBR[i])) {
      month = i + 1;
      break;
    }
  }

  // Numeric month only (e.g. "1", "01", "1/2025", "01/2025")
  if (month === null) {
    const m = lower.match(/^(\d{1,2})(\/\d{4})?$/);
    if (m) {
      const n = parseInt(m[1]);
      if (n >= 1 && n <= 12) month = n;
    }
  }

  if (month === null) return null;

  const yearMatch = name.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : (fallbackYear ?? null);
  if (!year) return null;

  return { year, month };
}

// ── Async CSV parser ─────────────────────────────────────────────────────────

/**
 * Parse a CSV buffer without first converting it to a JS string.
 * Pushes 64 KB chunks through a Node.js Readable with a setImmediate gap
 * between each chunk so the event loop stays free during the entire parse —
 * this lets SSE data flush to the TCP socket and lets setInterval heartbeats
 * fire instead of blocking for the whole duration of a large-file parse.
 */
function parseCsvBufferAsync(buffer: Buffer): Promise<Record<string, string>[]> {
  return new Promise<Record<string, string>[]>((resolve, reject) => {
    const rows: Record<string, string>[] = [];

    // Strip UTF-8 BOM if present
    const raw =
      buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
        ? buffer.slice(3)
        : buffer;

    // A Readable that emits 64 KB chunks with a setImmediate gap between
    // each push, so Node.js can flush SSE events and run timers between chunks.
    const CHUNK = 64 * 1024;
    const source = new Readable({ read() {} });
    let offset = 0;
    const pushNext = () => {
      if (offset >= raw.length) { source.push(null); return; }
      source.push(raw.slice(offset, Math.min(offset + CHUNK, raw.length)));
      offset += CHUNK;
      setImmediate(pushNext);
    };
    process.nextTick(pushNext);

    // PapaParse detects a Node.js Readable and processes it asynchronously.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Papa.parse(source as any, {
      header: true,
      skipEmptyLines: true,
      step(result) {
        const row = result.data as Record<string, string>;
        const normalized: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          const k = key
            .replace(/^\uFEFF/, "")
            .trim()
            .toLowerCase()
            .replace(/[\s\-]+/g, "_");
          normalized[k] = value as string;
        }
        rows.push(normalized);
      },
      complete: () => resolve(rows),
      error:    (err: Error) => reject(err),
    });
  });
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function runImport(
  importFile: IImportFileDocument,
  inMemoryBuffer?: Buffer,
  onProgress?: ProgressFn,
): Promise<ImportResult> {
  // Use the provided buffer, then the persisted fileData, then fall back to reading from disk
  const buffer = inMemoryBuffer ?? (importFile.fileData ? Buffer.from(importFile.fileData) : await readFile(importFile.storagePath));
  const lower = importFile.filename.toLowerCase();
  const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");

  // ── AutoPoint xlsx: iterate every sheet (one per month) ──────────────────
  if (isExcel && importFile.fileType === "autopoint") {
    const wb = XLSX.read(buffer, { type: "buffer" });
    let totalRecords = 0;
    let totalImported = 0;
    const allErrors: string[] = [];

    for (const sheetName of wb.SheetNames) {
      const parsed = parseSheetDate(sheetName, importFile.year);
      if (!parsed) continue; // silently skip non-month tabs (e.g. "YTD Report")
      const sheetRows = normalizeAutoPointSheet(wb.Sheets[sheetName]);
      if (sheetRows.length === 0) continue;
      const result = await importAutoPoint(sheetRows, parsed.year, parsed.month);
      totalRecords  += result.recordsTotal;
      totalImported += result.recordsImported;
      if (result.errors) allErrors.push(...result.errors.map((e) => `[${sheetName}] ${e}`));
    }

    return {
      recordsTotal:    totalRecords,
      recordsImported: totalImported,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };
  }

  // ── Dealer Master xlsx: main sheet + optional AutoPoint rollup tab ────────
  if (isExcel && importFile.fileType === "dealers") {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const mainRows   = normalizeExcelSheet(wb.Sheets[wb.SheetNames[0]]);
    const mainResult = await importDealers(mainRows);

    const apTabName = wb.SheetNames.find((n) => /autopoint/i.test(n));
    if (!apTabName) return mainResult;

    const apRows   = normalizeExcelSheet(wb.Sheets[apTabName]);
    const apResult = await importAutoPointRollup(apRows);
    const allErrors = [
      ...(mainResult.errors ?? []),
      ...(apResult.errors?.map((e) => `[AutoPoint Rollup] ${e}`) ?? []),
    ];
    return {
      recordsTotal:    mainResult.recordsTotal    + apResult.recordsTotal,
      recordsImported: mainResult.recordsImported + apResult.recordsImported,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };
  }

  // ── Standard single-sheet / CSV path ─────────────────────────────────────
  const rows: Record<string, string>[] = [];

  if (isExcel) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    rows.push(...normalizeExcelSheet(wb.Sheets[wb.SheetNames[0]]));
  } else {
    // Async streaming parse — does NOT block the event loop (see parseCsvBufferAsync above).
    await onProgress?.(0, 0, "Parsing file…");
    const parsed = await parseCsvBufferAsync(buffer);
    rows.push(...parsed);
    await onProgress?.(0, rows.length, "File parsed, starting import…");
  }

  switch (importFile.fileType) {
    case "dealers":
      return importDealers(rows);
    case "contracts":
      return importContracts(rows, onProgress);
    case "mpp":
      return importMPP(rows);
    case "units":
      return importUnits(rows, importFile.year!, importFile.month!);
    case "zie":
      return importZIE(rows, importFile.year!, importFile.month!);
    case "billing":
      return importBilling(rows, importFile.year!, importFile.month!);
    case "autopoint":
      // CSV path (single month — requires year + month on the ImportFile record)
      return importAutoPoint(rows, importFile.year!, importFile.month!);
    default:
      throw new Error(`Unknown file type: ${importFile.fileType}`);
  }
}
