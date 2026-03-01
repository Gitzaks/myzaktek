import Papa from "papaparse";
import bcrypt from "bcryptjs";
import { inngest } from "../client";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import type { IImportFileDocument } from "@/models/ImportFile";
import ChunkBuffer from "@/models/ChunkBuffer";
import {
  validateContractColumns,
  upsertDealers,
  upsertCustomers,
  upsertContracts,
} from "@/lib/importers/contractsImporter";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getBuffer(storagePath: string | undefined, fileData: Buffer | undefined): Promise<Buffer> {
  if (storagePath?.startsWith("mongodb-chunk:")) {
    const uploadId = storagePath.replace("mongodb-chunk:", "");
    const chunks   = await ChunkBuffer.find({ uploadId }).sort({ chunkIndex: 1 });
    if (chunks.length === 0) throw new Error("File chunks not found — please re-upload the file.");
    return Buffer.concat(chunks.map((c) => Buffer.from(c.data as Buffer)));
  }
  if (fileData) return Buffer.from(fileData);
  throw new Error("File data not found — please re-upload the file.");
}

function parseCsv(buffer: Buffer): Record<string, string>[] {
  const bom  = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const text = (bom ? buffer.slice(3) : buffer).toString("utf8");
  return Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: "|",
    skipEmptyLines: true,
    transformHeader: (h) =>
      h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_"),
  }).data;
}

/** Append a timestamped entry to file.debugLog (capped at 400 entries). */
function log(file: IImportFileDocument, message: string) {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
  const entry = `[${ts}] ${message}`;
  file.debugLog = [...(file.debugLog ?? []), entry].slice(-400);
}

/**
 * Returns an onBatch callback that:
 * - Updates stepPct (0-100) on every batch
 * - Appends a debug log entry at 0, 25, 50, 75, 100% thresholds
 * - Saves the file document on every call
 */
function makeStepProgress(
  file: IImportFileDocument,
  stepLabel: string,
) {
  let lastLoggedThreshold = -1;
  const thresholds = [0, 25, 50, 75, 100];

  return async (done: number, total: number) => {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    file.stepPct = pct;

    const crossed = thresholds.find((t) => pct >= t && t > lastLoggedThreshold);
    if (crossed !== undefined) {
      lastLoggedThreshold = crossed;
      log(file, `${stepLabel} ${pct}% — ${done.toLocaleString()} / ${total.toLocaleString()}`);
    }

    await file.save();
  };
}

// ── Inngest function ──────────────────────────────────────────────────────────

/**
 * Inngest background function for ZAKCNTRCTS imports.
 *
 * Three independent steps — each gets its own Vercel 300 s budget (900 s total).
 * Each step resets stepPct to 0 and counts up to 100 independently.
 * Debug log entries are written throughout and persisted to MongoDB so the
 * admin UI can display them live via its 5-second polling loop.
 */
export const processImport = inngest.createFunction(
  { id: "process-contract-import", retries: 0 },
  { event: "import/requested" },
  async ({ event, step }) => {
    const { fileId } = event.data as { fileId: string };

    // ── Step 1: validate + import dealers (step resets 0 → 100%) ─────────────
    const rowCount = await step.run("dealers", async () => {
      await connectDB();
      const file = await ImportFile.findById(fileId);
      if (!file) throw new Error(`ImportFile ${fileId} not found`);

      file.currentStep = "dealers";
      file.stepPct     = 0;
      file.statusMessage = "Step 1/3 — Dealers: starting…";
      log(file, "=== Step 1/3 (Dealers) started ===");
      await file.save();

      // Parse CSV
      let rows: Record<string, string>[];
      try {
        const buffer = await getBuffer(file.storagePath, file.fileData);
        rows = parseCsv(buffer);
        log(file, `Step 1/3 (Dealers) — parsed ${rows.length.toLocaleString()} rows from file`);
        await file.save();
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = err instanceof Error ? err.message : String(err);
        log(file, `Step 1/3 (Dealers) ERROR reading file: ${file.errorMessage}`);
        await file.save();
        throw err;
      }

      // Validate columns
      const validationError = validateContractColumns(rows);
      if (validationError) {
        file.status       = "import_failed";
        file.errorMessage = validationError;
        log(file, `Step 1/3 (Dealers) VALIDATION FAILED: ${validationError}`);
        await file.save();
        throw new Error(validationError);
      }
      log(file, `Step 1/3 (Dealers) — column validation passed`);

      file.recordsTotal  = rows.length;
      file.statusMessage = "Step 1/3 — Dealers: upserting…";
      await file.save();

      // Upsert dealers with per-step progress
      const onBatch = makeStepProgress(file, "Step 1/3 (Dealers)");
      try {
        await upsertDealers(rows, onBatch);
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = `Dealer import failed: ${err instanceof Error ? err.message : String(err)}`;
        log(file, `Step 1/3 (Dealers) ERROR: ${file.errorMessage}`);
        await file.save();
        throw err;
      }

      file.stepPct       = 100;
      file.statusMessage = "Step 1/3 — Dealers: complete";
      log(file, `=== Step 1/3 (Dealers) complete ===`);
      await file.save();

      return rows.length;
    });

    // ── Step 2: import customers (step resets 0 → 100%) ──────────────────────
    await step.run("customers", async () => {
      await connectDB();
      const file = await ImportFile.findById(fileId);
      if (!file) throw new Error(`ImportFile ${fileId} not found`);

      file.currentStep = "customers";
      file.stepPct     = 0;
      file.statusMessage = "Step 2/3 — Customers: starting…";
      log(file, "=== Step 2/3 (Customers) started ===");
      await file.save();

      // Re-parse (each step is independent — no shared in-memory state)
      let rows: Record<string, string>[];
      try {
        const buffer = await getBuffer(file.storagePath, file.fileData);
        rows = parseCsv(buffer);
        log(file, `Step 2/3 (Customers) — re-parsed ${rows.length.toLocaleString()} rows`);
        await file.save();
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = err instanceof Error ? err.message : String(err);
        log(file, `Step 2/3 (Customers) ERROR reading file: ${file.errorMessage}`);
        await file.save();
        throw err;
      }

      const hash = await bcrypt.hash("zaktek-import-placeholder", 4);
      file.statusMessage = "Step 2/3 — Customers: upserting…";
      await file.save();

      const onBatch = makeStepProgress(file, "Step 2/3 (Customers)");
      try {
        await upsertCustomers(rows, hash, onBatch);
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = `Customer import failed: ${err instanceof Error ? err.message : String(err)}`;
        log(file, `Step 2/3 (Customers) ERROR: ${file.errorMessage}`);
        await file.save();
        throw err;
      }

      file.stepPct       = 100;
      file.statusMessage = "Step 2/3 — Customers: complete";
      log(file, `=== Step 2/3 (Customers) complete ===`);
      await file.save();
    });

    // ── Step 3: import contracts + finalize (step resets 0 → 100%) ───────────
    await step.run("contracts", async () => {
      await connectDB();
      const file = await ImportFile.findById(fileId);
      if (!file) throw new Error(`ImportFile ${fileId} not found`);

      file.currentStep = "contracts";
      file.stepPct     = 0;
      file.statusMessage = "Step 3/3 — Contracts: starting…";
      log(file, "=== Step 3/3 (Contracts) started ===");
      await file.save();

      // Re-parse + delete chunks after this final read
      let rows: Record<string, string>[];
      try {
        const buffer = await getBuffer(file.storagePath, file.fileData);
        rows = parseCsv(buffer);
        log(file, `Step 3/3 (Contracts) — re-parsed ${rows.length.toLocaleString()} rows`);

        if (file.storagePath?.startsWith("mongodb-chunk:")) {
          const uploadId = file.storagePath.replace("mongodb-chunk:", "");
          await ChunkBuffer.deleteMany({ uploadId });
          log(file, `Step 3/3 (Contracts) — chunk data cleaned up`);
        }
        await file.save();
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = err instanceof Error ? err.message : String(err);
        log(file, `Step 3/3 (Contracts) ERROR reading file: ${file.errorMessage}`);
        await file.save();
        throw err;
      }

      file.statusMessage = "Step 3/3 — Contracts: upserting…";
      await file.save();

      const onBatch = makeStepProgress(file, "Step 3/3 (Contracts)");
      let result: { imported: number; errors: string[] };
      try {
        result = await upsertContracts(rows, onBatch);
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = `Contract import failed: ${err instanceof Error ? err.message : String(err)}`;
        log(file, `Step 3/3 (Contracts) ERROR: ${file.errorMessage}`);
        await file.save();
        throw err;
      }

      file.status          = "imported";
      file.stepPct         = 100;
      file.recordsImported = result.imported;
      file.processedRows   = rowCount;
      file.statusMessage   = "Import complete";
      file.importErrors    = result.errors;
      file.errorMessage    = result.errors.length
        ? `${result.errors.length} row(s) had errors`
        : undefined;
      log(file, `=== Step 3/3 (Contracts) complete — ${result.imported.toLocaleString()} contracts upserted${result.errors.length ? `, ${result.errors.length} row error(s)` : ""} ===`);
      log(file, "=== Import finished ===");
      await file.save();
    });
  },
);
