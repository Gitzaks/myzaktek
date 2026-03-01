import bcrypt from "bcryptjs";
import Dealer from "@/models/Dealer";
import User from "@/models/User";
import Contract from "@/models/Contract";
import type { ImportResult, ProgressFn } from "./index";

const PLAN_MAP: Record<string, "Basic" | "Basic with Interior" | "Ultimate" | "Ultimate with Interior"> = {
  "basic":                  "Basic",
  "basic with interior":    "Basic with Interior",
  "ultimate":               "Ultimate",
  "ultimate with interior": "Ultimate with Interior",
  "bsc":                    "Basic",
  "bscnc":                  "Basic",
  "bscwint":                "Basic with Interior",
  "bscwintnc":              "Basic with Interior",
  "ult":                    "Ultimate",
  "ultnc":                  "Ultimate",
  "ultwint":                "Ultimate with Interior",
  "ultwintnc":              "Ultimate with Interior",
};

const COVERAGE_TYPE: Record<string, "exterior" | "interior" | "both"> = {
  "Basic": "exterior",
  "Basic with Interior": "both",
  "Ultimate": "both",
  "Ultimate with Interior": "both",
};

const BATCH    = 2000;
const PARALLEL = 8;    // keep well below pool size to avoid connection saturation

const BULK_TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`bulkWrite timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

async function bulkWrite<T>(
  model: { bulkWrite: (ops: T[], opts: object) => Promise<unknown> },
  ops: T[],
  onBatch?: (done: number, total: number) => Promise<void>,
  batchSize = BATCH,
) {
  const batches: T[][] = [];
  for (let i = 0; i < ops.length; i += batchSize) {
    batches.push(ops.slice(i, i + batchSize));
  }

  for (let i = 0; i < batches.length; i += PARALLEL) {
    await Promise.all(
      batches.slice(i, i + PARALLEL).map((batch) =>
        withTimeout(
          model.bulkWrite(batch, { ordered: false }),
          BULK_TIMEOUT_MS,
        ).catch((err: unknown) => {
          if ((err as { name?: string }).name !== "MongoBulkWriteError") throw err;
        }),
      ),
    );
    const done = Math.min((i + PARALLEL) * batchSize, ops.length);
    if (onBatch) await onBatch(done, ops.length);
  }
}

function parseDate(s: string | undefined): Date | null {
  if (!s || s.trim() === "" || s === "0000-00-00") return null;
  const parts = s.trim().split("/");
  if (parts.length === 3) {
    const m = parseInt(parts[0], 10);
    const d = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (!isNaN(m) && !isNaN(d) && !isNaN(y)) {
      return new Date(y < 100 ? 2000 + y : y, m - 1, d);
    }
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function contractStatus(row: Record<string, string>): "active" | "cancelled" | "expired" {
  if (row.cancel_post_date && row.cancel_post_date !== "0000-00-00") return "cancelled";
  const exp = parseDate(row.expiration_date);
  if (exp && exp < new Date()) return "expired";
  return "active";
}

function rowEmail(row: Record<string, string>): string {
  const raw = row.email_address?.trim().toLowerCase();
  return raw || `${row.agreement?.trim()}-${row.agreement_suffix?.trim()}@noemail.zaktek.com`;
}

function agreementId(row: Record<string, string>): string {
  return `${row.agreement?.trim()}-${row.agreement_suffix?.trim()}`;
}

// ── Standalone phase exports (used by the Inngest background function) ────────

/**
 * Validates column names and dealer count before any DB writes.
 * Returns an error string on failure, null on success.
 */
export function validateContractColumns(rows: Record<string, string>[]): string | null {
  if (rows.length === 0) return null;
  const foundKeys = new Set(Object.keys(rows[0]));
  const REQUIRED = ["agreement", "agreement_suffix", "dealer_code", "expiration_date", "coverage", "vin"];
  const missing  = REQUIRED.filter((k) => !foundKeys.has(k));
  if (missing.length > 0) {
    return (
      `Column mapping mismatch — missing: [${missing.join(", ")}]. ` +
      `Found ${foundKeys.size} columns: [${[...foundKeys].join(", ")}]`
    );
  }
  const dealerCodes = new Set(rows.map((r) => r.dealer_code?.trim()).filter(Boolean));
  if (dealerCodes.size > 500) {
    return (
      `Column mapping error — found ${dealerCodes.size} unique dealer_code values (expected ≤500). ` +
      `Samples: [${[...dealerCodes].slice(0, 5).join(", ")}]`
    );
  }
  return null;
}

/** Phase 1: upsert all unique dealers found in the rows. */
export async function upsertDealers(
  rows: Record<string, string>[],
  onBatch?: (done: number, total: number) => Promise<void>,
): Promise<void> {
  const dealerRowMap = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const code = row.dealer_code?.trim();
    if (code && !dealerRowMap.has(code)) dealerRowMap.set(code, row);
  }

  const ops = [...dealerRowMap.entries()].map(([code, row]) => {
    const dealerName  = row.dealer_name?.trim()  || undefined;
    const dealerPhone = (row.dealer_phone ?? row.dealer_phone_number ?? row.phone_number ?? row.phone ?? "").trim() || undefined;
    const dealerAddr  = (row.dealer_address_1 ?? row.dealer_address ?? row.address_1 ?? row.address ?? "").trim() || undefined;
    const dealerCity  = (row.dealer_city  ?? row.city  ?? "").trim() || undefined;
    const dealerState = (row.dealer_state ?? row.state ?? "").trim() || undefined;
    const dealerZip   = (row.dealer_zip_code ?? row.dealer_zip ?? row.zip_code ?? row.zip ?? "").trim() || undefined;

    return {
      updateOne: {
        filter: { dealerCode: code },
        update: {
          $set: {
            dealerCode: code,
            ...(dealerName  && { name: dealerName, zakCntrtsDealer: dealerName }),
            ...(dealerAddr  && { address: dealerAddr }),
            ...(dealerCity  && { city: dealerCity }),
            ...(dealerState && { state: dealerState }),
            ...(dealerZip   && { zip: dealerZip }),
            ...(dealerPhone && { phone: dealerPhone }),
          },
          $setOnInsert: {
            email: `${code.toLowerCase()}@dealers.zaktek.com`,
            active: true,
            ...(dealerName ? {} : { name: code }),
            ...(dealerAddr  === undefined && { address: "" }),
            ...(dealerCity  === undefined && { city: "" }),
            ...(dealerState === undefined && { state: "" }),
            ...(dealerZip   === undefined && { zip: "" }),
            ...(dealerPhone === undefined && { phone: "" }),
          },
        },
        upsert: true,
      },
    };
  });

  await bulkWrite(Dealer, ops, onBatch);
}

/** Phase 2: upsert all unique customers found in the rows. */
export async function upsertCustomers(
  rows: Record<string, string>[],
  placeholderHash: string,
  onBatch?: (done: number, total: number) => Promise<void>,
): Promise<void> {
  const userRowMap = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const email = rowEmail(row);
    if (!userRowMap.has(email)) userRowMap.set(email, row);
  }

  const ops = [...userRowMap.entries()].map(([email, row]) => {
    const fullName = `${row.owner_first_name?.trim() ?? ""} ${row.owner_last_name?.trim() ?? ""}`.trim();
    return {
      updateOne: {
        filter: { email },
        update: {
          $set: {
            name:    fullName,
            phone:   row.owner_phone?.trim()     || undefined,
            address: row.owner_address_1?.trim() || undefined,
            city:    row.owner_city?.trim()       || undefined,
            state:   row.owner_state?.trim()      || undefined,
            zip:     row.owner_zip_code?.trim()   || undefined,
          },
          $setOnInsert: {
            email,
            password: placeholderHash,
            role:     "customer",
            dealerIds: [],
            active:   true,
          },
        },
        upsert: true,
      },
    };
  });

  await bulkWrite(User, ops, onBatch);
}

/**
 * Phase 3: upsert all contracts.
 * Rebuilds the dealer and customer ID maps from the DB (no in-memory state
 * needed from previous phases — safe to call independently in a separate step).
 */
export async function upsertContracts(
  rows: Record<string, string>[],
  onBatch?: (done: number, total: number) => Promise<void>,
): Promise<{ imported: number; errors: string[] }> {
  // Rebuild dealer ID map
  const dealerCodes = [...new Set(rows.map((r) => r.dealer_code?.trim()).filter(Boolean))];
  const dealersInDB = await Dealer.find({ dealerCode: { $in: dealerCodes } }, { dealerCode: 1 }).lean();
  const dealerIdMap = new Map(dealersInDB.map((d) => [d.dealerCode as string, d._id]));

  // Rebuild customer ID map (batched parallel queries)
  const allEmails   = [...new Set(rows.map(rowEmail))];
  const userIdMap   = new Map<string, unknown>();
  const emailBatches: string[][] = [];
  for (let i = 0; i < allEmails.length; i += 5000) {
    emailBatches.push(allEmails.slice(i, i + 5000));
  }
  for (let i = 0; i < emailBatches.length; i += PARALLEL) {
    const results = await Promise.all(
      emailBatches.slice(i, i + PARALLEL).map((batch) =>
        User.find({ email: { $in: batch } }, { email: 1 }).lean(),
      ),
    );
    for (const users of results) {
      for (const u of users) userIdMap.set(u.email as string, u._id);
    }
  }

  const ops = rows.map((row) => {
    const code        = row.dealer_code?.trim();
    const email       = rowEmail(row);
    const agId        = agreementId(row);
    const coverageRaw = row.coverage?.trim() ?? "";
    const plan        = PLAN_MAP[coverageRaw.toLowerCase()] ?? "Basic";
    const status      = contractStatus(row);
    const purchaseDate   = parseDate(row.contract_purchase_date) ?? new Date();
    const expirationDate = parseDate(row.expiration_date) ?? new Date();

    return {
      updateOne: {
        filter: { agreementId: agId },
        update: {
          $set: {
            customerId: userIdMap.get(email),
            dealerId:   dealerIdMap.get(code ?? ""),
            vin:        row.vin?.trim().toUpperCase() || undefined,
            plan,
            status,
            beginsAt:     purchaseDate,
            endsAt:       expirationDate,
            purchaseDate,
            ...(row.plan?.trim()              && { planCode:     row.plan.trim() }),
            ...(row.beginning_mileage?.trim() && { beginMileage: parseInt(row.beginning_mileage, 10) || undefined }),
            ...(row.coverage_miles?.trim()    && { maxMileage:   parseInt(row.coverage_miles, 10)    || undefined }),
            ...(row.deductible?.trim()        && { deductible:   parseFloat(row.deductible)          || 0 }),
            ...(row.sales_price?.trim()       && { salePrice:    parseFloat(row.sales_price)         || undefined }),
            ...(row.internal_cost?.trim()     && { internalCost: parseFloat(row.internal_cost)       || undefined }),
          },
          $setOnInsert: { homeKit: false },
        },
        upsert: true,
      },
    };
  });

  await bulkWrite(Contract, ops, onBatch);

  return { imported: new Set(rows.map(agreementId)).size, errors: [] };
}

// ── Legacy all-in-one entry point (SSE path / other callers) ─────────────────

export async function importContracts(
  rows: Record<string, string>[],
  onProgress?: ProgressFn,
): Promise<ImportResult> {
  if (rows.length === 0) return { recordsTotal: 0, recordsImported: 0 };
  const total = rows.length;

  const validationError = validateContractColumns(rows);
  if (validationError) {
    return { recordsTotal: total, recordsImported: 0, errors: [validationError] };
  }

  const placeholderHash = await bcrypt.hash("zaktek-import-placeholder", 4);

  // Phase 1: dealers (0 → 5%)
  await upsertDealers(rows);
  await onProgress?.(Math.round(total * 0.05), total, "Dealers imported");

  // Phase 2: customers (5 → 50%)
  await upsertCustomers(rows, placeholderHash, async (done, totalOps) => {
    await onProgress?.(
      Math.round(total * (0.05 + (done / totalOps) * 0.45)),
      total,
      `Importing customers: ${done.toLocaleString()} / ${totalOps.toLocaleString()}`,
    );
  });

  // Phase 3: contracts (50 → 100%)
  const result = await upsertContracts(rows, async (done, totalOps) => {
    await onProgress?.(
      Math.round(total * (0.50 + (done / totalOps) * 0.50)),
      total,
      `Importing contracts: ${done.toLocaleString()} / ${totalOps.toLocaleString()}`,
    );
  });

  await onProgress?.(total, total, "Import complete");

  return {
    recordsTotal:    total,
    recordsImported: result.imported,
    errors:          result.errors.length > 0 ? result.errors : undefined,
  };
}
