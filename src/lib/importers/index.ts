import { readFile } from "fs/promises";
import { Readable } from "stream";
import { Worker } from "worker_threads";
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
 * Parse an XLSX buffer by directly reading the ZIP+XML internals — bypassing
 * XLSX.read() entirely.  XLSX.read() must parse every file in the ZIP
 * (styles, themes, relationships, all sheets) before returning a single row.
 * For a 150 MB file with 500 k rows that exceeded the 5-minute Vercel limit.
 *
 * This implementation:
 *   1. Parses the ZIP central directory to locate only the 3 files we need.
 *   2. Decompresses each with Node's built-in zlib.inflateRawSync.
 *   3. Regex-parses shared strings + styles + sheet XML.
 *   4. Builds a CSV string and parses it with Papa.parse.
 *
 * No third-party packages beyond what is already installed.
 * Falls back to XLSX.read() if the custom parser throws.
 */
async function parseXlsxAsync(buffer: Buffer): Promise<Record<string, string>[]> {
  // The heavy lifting runs in a worker thread so the main thread can keep
  // flushing SSE heartbeats while we chew through a large file.
  const workerScript = /* js */ `
    'use strict';
    const { parentPort, workerData } = require('worker_threads');
    const zlib = require('node:zlib');

    function decodeXmlEntities(s) {
      return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'").replace(/&quot;/g,'"');
    }

    function findZipEntries(buf) {
      // Scan backwards for End-Of-Central-Directory signature 0x06054b50
      let eocd = -1;
      for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
      }
      if (eocd === -1) throw new Error('Not a valid ZIP/XLSX file (no EOCD)');
      const cdOffset = buf.readUInt32LE(eocd + 16);
      const numEntries = buf.readUInt16LE(eocd + 10);
      const entries = new Map();
      let pos = cdOffset;
      for (let i = 0; i < numEntries; i++) {
        if (buf.readUInt32LE(pos) !== 0x02014b50) break;
        const compMethod  = buf.readUInt16LE(pos + 10);
        const compSize    = buf.readUInt32LE(pos + 20);
        const fnLen       = buf.readUInt16LE(pos + 28);
        const extraLen    = buf.readUInt16LE(pos + 30);
        const commentLen  = buf.readUInt16LE(pos + 32);
        const localOffset = buf.readUInt32LE(pos + 42);
        const name = buf.slice(pos + 46, pos + 46 + fnLen).toString('utf8');
        entries.set(name, { localOffset, compMethod, compSize });
        pos += 46 + fnLen + extraLen + commentLen;
      }
      return entries;
    }

    function extractEntry(buf, entry) {
      const fnLen    = buf.readUInt16LE(entry.localOffset + 26);
      const extraLen = buf.readUInt16LE(entry.localOffset + 28);
      const start    = entry.localOffset + 30 + fnLen + extraLen;
      const data     = buf.slice(start, start + entry.compSize);
      return entry.compMethod === 0 ? data : zlib.inflateRawSync(data);
    }

    function parseSharedStrings(xml) {
      const strings = [];
      const siRe = /<si>([\\\s\\\S]*?)<\\/si>/g;
      const tRe  = /<t(?:[^>]*)?>([^<]*)<\\/t>/g;
      let m;
      while ((m = siRe.exec(xml)) !== null) {
        let val = '';
        tRe.lastIndex = 0;
        let tm;
        while ((tm = tRe.exec(m[1])) !== null) val += decodeXmlEntities(tm[1]);
        strings.push(val);
      }
      return strings;
    }

    function parseDateStyleIndices(xml) {
      const DATE_IDS = new Set([14,15,16,17,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58]);
      const customDateIds = new Set();
      const numFmtRe = /<numFmt numFmtId="(\\d+)" formatCode="([^"]+)"/g;
      let nfm;
      while ((nfm = numFmtRe.exec(xml)) !== null) {
        const code = nfm[2].toLowerCase();
        if (/[ymd]/.test(code) && !/^[#0.,\\s%]+$/.test(code)) customDateIds.add(parseInt(nfm[1]));
      }
      const result = new Set();
      const cellXfsMatch = /<cellXfs>([\\s\\S]*?)<\\/cellXfs>/.exec(xml);
      if (cellXfsMatch) {
        let idx = 0;
        const xfRe = /<xf\\b[^>]*numFmtId="(\\d+)"/g;
        let xfm;
        while ((xfm = xfRe.exec(cellXfsMatch[1])) !== null) {
          const id = parseInt(xfm[1]);
          if (DATE_IDS.has(id) || customDateIds.has(id)) result.add(idx);
          idx++;
        }
      }
      return result;
    }

    function excelSerialToDate(serial) {
      const d = new Date((serial - 25569) * 86400000);
      const y  = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dy = String(d.getUTCDate()).padStart(2, '0');
      return y + '-' + mo + '-' + dy;
    }

    function colStrToIdx(col) {
      let n = 0;
      for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
      return n - 1;
    }

    function parseSheet(xml, sharedStrings, dateStyleIndices) {
      const allRows = [];
      let maxCols = 0;
      // Split on </row> — faster than a greedy regex over the whole XML
      const parts = xml.split('<\\/row>');
      const cellRe = /<c\\b([^>]*)>(?:<v>([^<]*)<\\/v>|<is>\\s*<t>([^<]*)<\\/t>\\s*<\\/is>)?[^<]*<\\/c>|<c\\b[^>]*\\/>/g;
      for (const part of parts) {
        const rowStart = part.lastIndexOf('<row');
        if (rowStart === -1) continue;
        const rowXml = part.slice(rowStart);
        const row = {};
        let maxCol = -1;
        cellRe.lastIndex = 0;
        let cm;
        while ((cm = cellRe.exec(rowXml)) !== null) {
          const attrs = cm[1] ?? '';
          const rMatch = /\\br="([A-Z]+)\\d+"/i.exec(attrs);
          if (!rMatch) continue;
          const colIdx = colStrToIdx(rMatch[1].toUpperCase());
          const tMatch = /\\bt="([^"]+)"/.exec(attrs);
          const sMatch = /\\bs="(\\d+)"/.exec(attrs);
          const cellType = tMatch ? tMatch[1] : '';
          const styleIdx = sMatch ? parseInt(sMatch[1]) : -1;
          const v = cm[2] ?? cm[3] ?? '';
          let value;
          if (cellType === 's') {
            value = sharedStrings[parseInt(v)] ?? '';
          } else if (cellType === 'inlineStr' || cellType === 'str') {
            value = decodeXmlEntities(v);
          } else if (v !== '' && styleIdx >= 0 && dateStyleIndices.has(styleIdx)) {
            value = excelSerialToDate(parseFloat(v));
          } else {
            value = v;
          }
          row[colIdx] = value;
          if (colIdx > maxCol) maxCol = colIdx;
        }
        if (maxCol >= 0) {
          const arr = [];
          for (let i = 0; i <= maxCol; i++) arr.push(row[i] ?? '');
          allRows.push(arr);
          if (maxCol + 1 > maxCols) maxCols = maxCol + 1;
        }
      }
      return { allRows, maxCols };
    }

    function buildCsv(allRows, maxCols) {
      return allRows.map(row => {
        const padded = row.length < maxCols
          ? row.concat(new Array(maxCols - row.length).fill(''))
          : row;
        return padded.map(v => {
          if (v.includes(',') || v.includes('"') || v.includes('\\n') || v.includes('\\r')) {
            return '"' + v.replace(/"/g, '""') + '"';
          }
          return v;
        }).join(',');
      }).join('\\n');
    }

    try {
      const buf = Buffer.from(new Uint8Array(workerData.buffer));
      const entries = findZipEntries(buf);

      // Shared strings (may be absent for all-numeric sheets)
      let sharedStrings = [];
      const ssEntry = entries.get('xl/sharedStrings.xml');
      if (ssEntry) sharedStrings = parseSharedStrings(extractEntry(buf, ssEntry).toString('utf8'));

      // Date-style indices
      let dateStyleIndices = new Set();
      const stylesEntry = entries.get('xl/styles.xml');
      if (stylesEntry) dateStyleIndices = parseDateStyleIndices(extractEntry(buf, stylesEntry).toString('utf8'));

      // First worksheet
      let sheetName = 'xl/worksheets/sheet1.xml';
      if (!entries.has(sheetName)) {
        for (const name of entries.keys()) {
          if (name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml')) { sheetName = name; break; }
        }
      }
      const sheetEntry = entries.get(sheetName);
      if (!sheetEntry) throw new Error('No worksheet found in XLSX');
      const sheetXml = extractEntry(buf, sheetEntry).toString('utf8');

      const { allRows, maxCols } = parseSheet(sheetXml, sharedStrings, dateStyleIndices);
      const csv = buildCsv(allRows, maxCols);
      parentPort.postMessage({ ok: true, csv });
    } catch (err) {
      parentPort.postMessage({ ok: false, error: err.message });
    }
  `;

  // Transfer the buffer zero-copy into the worker.
  const ab = new ArrayBuffer(buffer.length);
  new Uint8Array(ab).set(buffer);

  const csv = await new Promise<string>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(workerScript, {
        eval: true,
        workerData: { buffer: ab },
        transferList: [ab],
      });
    } catch {
      // Worker unavailable — fall back to xlsx library synchronously.
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return resolve(XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n" }));
    }

    worker.on("message", (msg: { ok: boolean; csv?: string; error?: string }) => {
      if (msg.ok) resolve(msg.csv!);
      else reject(new Error(msg.error));
    });
    worker.on("error", (err) => {
      // Worker runtime error — fall back to xlsx library.
      try {
        const wb = XLSX.read(buffer, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_csv(ws, { FS: ",", RS: "\n" }));
      } catch {
        reject(err);
      }
    });
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`XLSX worker exited with code ${code}`));
    });
  });

  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) =>
      h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_"),
  });
  return parsed.data;
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

// ── ZAKCNTRCTS positional column map ─────────────────────────────────────────
// This file has NO header row. Column positions are fixed (A–AL, 38 cols).
// Col indices confirmed from first-row diagnostic (Feb 2026 import).
const ZAKCNTRCTS_COLUMNS = [
  "record_type",            // 0 : always "1"
  "record_sub",             // 1 : always "2"
  "term_months",            // 2 : e.g. 60
  "vehicle_year",           // 3 : e.g. 2016
  "agreement",              // 4 : 5-digit agreement number
  "dealer_zip_code",        // 5 : dealer zip
  "owner_zip_code",         // 6 : customer zip (duplicate city/state follow)
  "max_mileage",            // 7 : e.g. 999999
  "agreement_suffix",       // 8 : 8-digit suffix (forms unique agreementId with col 4)
  "dealer_code",            // 9 : e.g. ZAK0674
  "dealer_name",            // 10: e.g. Camelback VW Mazda Subaru
  "dealer_address_1",       // 11: street address
  "dealer_city",            // 12: city
  "dealer_state",           // 13: state
  "dealer_phone",           // 14: phone (may be empty)
  "owner_last_name",        // 15: customer last name
  "owner_first_name",       // 16: customer first name (may include middle)
  "owner_address_1",        // 17: customer street address
  "owner_address_2",        // 18: apt / unit (often empty)
  "owner_city",             // 19: customer city
  "owner_state",            // 20: customer state
  "owner_phone",            // 21: customer phone
  "plan_code",              // 22: SKU e.g. 15ZAKEQU
  "coverage",               // 23: ZAK code e.g. ULTWINTNC
  "begin_mileage",          // 24: odometer at purchase
  "col_25",                 // 25: (reserved / unknown)
  "vin",                    // 26: 17-char VIN
  "vehicle_maker",          // 27: make abbreviation e.g. LEXS
  "model_code",             // 28: model code e.g. RX5
  "series_name",            // 29: full model name e.g. RX 350
  "contract_purchase_date", // 30: purchase / start date
  "cancel_post_date",       // 31: cancellation post date ("00/00/0000" = active)
  "expiration_date",        // 32: contract end date
  "cancel_date",            // 33: cancellation effective date
  "email_address",          // 34: customer email
  "col_35",                 // 35: (reserved / unknown)
  "deductible",             // 36: deductible amount
  "sale_price",             // 37: gross sale price
  "internal_cost",          // 38: dealer net cost
] as const;

// ── Async CSV parser ─────────────────────────────────────────────────────────

/**
 * Parse a CSV buffer without first converting it to a JS string.
 * Pushes 64 KB chunks through a Node.js Readable with a setImmediate gap
 * between each chunk so the event loop stays free during the entire parse —
 * this lets SSE data flush to the TCP socket and lets setInterval heartbeats
 * fire instead of blocking for the whole duration of a large-file parse.
 *
 * Pass `columns` for files that have NO header row (e.g. ZAKCNTRCTS). Each
 * row is then an array; values are mapped to the supplied column names by
 * position. Without `columns` the first CSV row is used as the header.
 */
function parseCsvBufferAsync(
  buffer: Buffer,
  columns?: readonly string[],
): Promise<Record<string, string>[]> {
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
      header: !columns,
      skipEmptyLines: true,
      step(result) {
        if (columns) {
          // Positional (no-header) mode — result.data is string[]
          const arr = result.data as string[];
          const row: Record<string, string> = {};
          columns.forEach((col, i) => { row[col] = (arr[i] ?? "").trim(); });
          rows.push(row);
        } else {
          // Named-header mode — normalise the key names
          const rawRow = result.data as Record<string, string>;
          const normalized: Record<string, string> = {};
          for (const [key, value] of Object.entries(rawRow)) {
            const k = key
              .replace(/^\uFEFF/, "")
              .trim()
              .toLowerCase()
              .replace(/[\s\-]+/g, "_");
            normalized[k] = value as string;
          }
          rows.push(normalized);
        }
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
  // NOTE: never use rows.push(...largeArray) — spreading 100k+ elements as
  // function arguments blows the JS call stack. Assign directly instead.
  let rows: Record<string, string>[];

  if (isExcel) {
    // parseXlsxAsync runs XLSX.read + sheet_to_json inside a worker_threads
    // worker, so the main event loop stays free to send SSE heartbeats and
    // progress events while the CPU-bound parse runs in the background.
    await onProgress?.(0, 0, "Parsing file…");
    rows = await parseXlsxAsync(buffer);
    await onProgress?.(0, rows.length, "File parsed, starting import…");
    await new Promise<void>((r) => setImmediate(r));
  } else {
    await onProgress?.(0, 0, "Parsing file…");

    if (importFile.fileType === "contracts") {
      // ZAKCNTRCTS is pipe-delimited with a header row (per CLAUDE.md).
      //
      // We parse synchronously rather than using the async Readable-stream
      // approach because Papa.parse() with a custom Node.js Readable stream
      // (non-NODE_STREAM_INPUT mode) has a well-documented bug: the `complete`
      // callback never fires, so the Promise never resolves and the Vercel
      // function hangs until it is killed after 300 s — which is exactly what
      // produces the "stuck at Parsing file…" symptom.
      //
      // PapaParse processes CSV at ~100 MB/s in Node.js, so even a 150 MB file
      // finishes in under 2 s.  The event loop blocks for those 2 s, but the
      // SSE connection has already dropped by this point (it always drops during
      // any blocking work) so there is nothing to flush anyway — DB polling
      // picks up progress as soon as the first bulkWrite batch saves to the DB.
      const bom = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
      const csvText = (bom ? buffer.slice(3) : buffer).toString("utf8");
      const parsed = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        delimiter: "|",
        skipEmptyLines: true,
        transformHeader: (h) =>
          h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_"),
      });
      rows = parsed.data;
    } else {
      rows = await parseCsvBufferAsync(buffer);
    }

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
