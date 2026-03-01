import Papa from "papaparse";
import bcrypt from "bcryptjs";
import { inngest } from "../client";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";
import ChunkBuffer from "@/models/ChunkBuffer";
import {
  validateContractColumns,
  upsertDealers,
  upsertCustomers,
  upsertContracts,
} from "@/lib/importers/contractsImporter";

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

/**
 * Inngest background function for ZAKCNTRCTS imports.
 *
 * Runs as three independent steps so each gets its own Vercel execution
 * budget (300 s) — total budget is 900 s, enough for 500 k-row files.
 * Progress is written to MongoDB after every batch; the frontend's
 * existing 5-second polling picks it up automatically.
 */
export const processImport = inngest.createFunction(
  { id: "process-contract-import", retries: 0 },
  { event: "import/requested" },
  async ({ event, step }) => {
    const { fileId } = event.data as { fileId: string };

    // ── Step 1: validate + import dealers (0 → 5%) ────────────────────────
    const rowCount = await step.run("dealers", async () => {
      await connectDB();
      const file = await ImportFile.findById(fileId);
      if (!file) throw new Error(`ImportFile ${fileId} not found`);

      let rows: Record<string, string>[];
      try {
        const buffer = await getBuffer(file.storagePath, file.fileData);
        rows = parseCsv(buffer);
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = err instanceof Error ? err.message : String(err);
        await file.save();
        throw err;
      }

      const validationError = validateContractColumns(rows);
      if (validationError) {
        file.status       = "import_failed";
        file.errorMessage = validationError;
        await file.save();
        throw new Error(validationError);
      }

      file.recordsTotal  = rows.length;
      file.processedRows = 0;
      file.statusMessage = "Importing dealers…";
      await file.save();

      try {
        await upsertDealers(rows);
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = `Dealer import failed: ${err instanceof Error ? err.message : String(err)}`;
        await file.save();
        throw err;
      }

      file.processedRows = Math.round(rows.length * 0.05);
      file.statusMessage = "Dealers done";
      await file.save();

      return rows.length;
    });

    // ── Step 2: import customers (5 → 50%) ────────────────────────────────
    await step.run("customers", async () => {
      await connectDB();
      const file = await ImportFile.findById(fileId);
      if (!file) throw new Error(`ImportFile ${fileId} not found`);

      let rows: Record<string, string>[];
      try {
        const buffer = await getBuffer(file.storagePath, file.fileData);
        rows = parseCsv(buffer);
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = err instanceof Error ? err.message : String(err);
        await file.save();
        throw err;
      }

      const hash = await bcrypt.hash("zaktek-import-placeholder", 4);
      file.statusMessage = "Importing customers…";
      await file.save();

      try {
        await upsertCustomers(rows, hash, async (done, total) => {
          file.processedRows = Math.round(rowCount * (0.05 + (done / total) * 0.45));
          file.statusMessage = `Customers: ${done.toLocaleString()} / ${total.toLocaleString()}`;
          await file.save();
        });
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = `Customer import failed: ${err instanceof Error ? err.message : String(err)}`;
        await file.save();
        throw err;
      }

      file.processedRows = Math.round(rowCount * 0.5);
      file.statusMessage = "Customers done";
      await file.save();
    });

    // ── Step 3: import contracts (50 → 100%) + finalize ───────────────────
    await step.run("contracts", async () => {
      await connectDB();
      const file = await ImportFile.findById(fileId);
      if (!file) throw new Error(`ImportFile ${fileId} not found`);

      let rows: Record<string, string>[];
      try {
        const buffer = await getBuffer(file.storagePath, file.fileData);
        rows = parseCsv(buffer);
        // Delete chunks after the final read — no longer needed
        if (file.storagePath?.startsWith("mongodb-chunk:")) {
          const uploadId = file.storagePath.replace("mongodb-chunk:", "");
          await ChunkBuffer.deleteMany({ uploadId });
        }
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = err instanceof Error ? err.message : String(err);
        await file.save();
        throw err;
      }

      file.statusMessage = "Importing contracts…";
      await file.save();

      let result: { imported: number; errors: string[] };
      try {
        result = await upsertContracts(rows, async (done, total) => {
          file.processedRows = Math.round(rowCount * (0.5 + (done / total) * 0.5));
          file.statusMessage = `Contracts: ${done.toLocaleString()} / ${total.toLocaleString()}`;
          await file.save();
        });
      } catch (err) {
        file.status       = "import_failed";
        file.errorMessage = `Contract import failed: ${err instanceof Error ? err.message : String(err)}`;
        await file.save();
        throw err;
      }

      file.status          = "imported";
      file.recordsImported = result.imported;
      file.processedRows   = rowCount;
      file.statusMessage   = "Import complete";
      file.importErrors    = result.errors;
      file.errorMessage    = result.errors.length
        ? `${result.errors.length} row(s) had errors`
        : undefined;
      await file.save();
    });
  },
);
