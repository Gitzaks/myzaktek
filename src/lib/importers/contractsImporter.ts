import bcrypt from "bcryptjs";
import Dealer from "@/models/Dealer";
import User from "@/models/User";
import Contract from "@/models/Contract";
import Vehicle from "@/models/Vehicle";
import ServiceRecord from "@/models/ServiceRecord";
import { getApplicationSchedule } from "@/lib/schedule";
import type { ImportResult, ProgressFn } from "./index";

/**
 * ZAKCNTRCTS import — header row present, columns named exactly as they appear.
 * A–AL (38 columns): dealer_code … internal_cost
 *
 * Uses bulk operations (bulkWrite) throughout to handle large files efficiently.
 * onProgress is called at every batch boundary so the SSE stream can push
 * live progress bars and phase descriptions to the browser.
 */

const PLAN_MAP: Record<string, "Basic" | "Basic with Interior" | "Ultimate" | "Ultimate with Interior"> = {
  // Human-readable names (header-based CSV format)
  "basic":                  "Basic",
  "basic with interior":    "Basic with Interior",
  "ultimate":               "Ultimate",
  "ultimate with interior": "Ultimate with Interior",
  // ZAK short codes (headerless CSV — coverage col contains these)
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

const BATCH    = 5_000;   // default batch size
const SR_BATCH = 20_000;  // larger batch for service records — fewer round-trips

/** Generic bulk-write helper that bypasses strict Mongoose typings and calls
 *  onBatch after each batch so the SSE stream can push live progress events.
 *
 *  With ordered:false, MongoDB attempts every op in a batch even when some fail.
 *  The driver then throws a MongoBulkWriteError to report the partial failures.
 *  We catch that error per-batch so the loop continues to subsequent batches
 *  instead of aborting mid-import. True unexpected errors (network, auth, etc.)
 *  are re-thrown so the outer try/catch can handle them. */
async function bulkWrite<T>(
  model: { bulkWrite: (ops: T[], opts: object) => Promise<unknown> },
  ops: T[],
  onBatch?: (done: number, total: number) => Promise<void>,
  batchSize = BATCH,
) {
  for (let i = 0; i < ops.length; i += batchSize) {
    try {
      await model.bulkWrite(ops.slice(i, i + batchSize), { ordered: false });
    } catch (err) {
      // MongoBulkWriteError means MongoDB processed all ops but some failed
      // (duplicate keys, validation, etc.). All other ops in the batch still
      // committed. Re-throw anything that isn't a bulk-write partial failure.
      if ((err as { name?: string }).name !== "MongoBulkWriteError") throw err;
    }
    if (onBatch) await onBatch(Math.min(i + batchSize, ops.length), ops.length);
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

export async function importContracts(
  rows: Record<string, string>[],
  onProgress?: ProgressFn,
): Promise<ImportResult> {
  if (rows.length === 0) return { recordsTotal: 0, recordsImported: 0 };
  const total = rows.length;

  const errors: string[] = [];
  const placeholderHash = await bcrypt.hash("zaktek-import-placeholder", 4);

  // ── 0. Column-name sanity check ───────────────────────────────────────────
  // Run this BEFORE any DB writes so mismatches surface immediately.
  const foundKeys = new Set(Object.keys(rows[0]));
  const REQUIRED = ["agreement", "agreement_suffix", "dealer_code", "expiration_date", "coverage", "vin"];
  const missing   = REQUIRED.filter((k) => !foundKeys.has(k));
  if (missing.length > 0) {
    errors.push(
      `Column mapping mismatch — missing: [${missing.join(", ")}]. ` +
      `All ${foundKeys.size} columns found: [${[...foundKeys].join(", ")}]`,
    );
    // Bail out — no point writing garbage data to the DB.
    return { recordsTotal: rows.length, recordsImported: 0, errors };
  }

  // ── 1. Bulk upsert dealers (0 → 5%) ───────────────────────────────────────
  const dealerRowMap = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const code = row.dealer_code?.trim();
    if (code && !dealerRowMap.has(code)) dealerRowMap.set(code, row);
  }

  // Sanity check: ZAKCNTRCTS should have ~85 unique dealer codes, not thousands.
  // A large count means the dealer_code column is misidentified (e.g. the file
  // has a different column order than expected). Bail out immediately with a
  // diagnostic so the admin can see which values were found in that column.
  const MAX_DEALERS = 500;
  if (dealerRowMap.size > MAX_DEALERS) {
    errors.push(
      `Column mapping error — found ${dealerRowMap.size.toLocaleString()} unique values in ` +
      `dealer_code column (expected ≤${MAX_DEALERS}). ` +
      `First 5 sample values: [${[...dealerRowMap.keys()].slice(0, 5).join(", ")}]. ` +
      `All ${foundKeys.size} columns detected: [${[...foundKeys].join(", ")}]`,
    );
    return { recordsTotal: rows.length, recordsImported: 0, errors };
  }

  const dealerOps = [...dealerRowMap.entries()].map(([code, row]) => {
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

  try {
    await bulkWrite(Dealer, dealerOps);
  } catch (err) {
    errors.push(`Dealer upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  await onProgress?.(
    Math.round(total * 0.05),
    total,
    `Imported ${dealerRowMap.size.toLocaleString()} dealers`,
  );

  // Build dealer code → _id lookup
  const dealersInDB = await Dealer.find(
    { dealerCode: { $in: [...dealerRowMap.keys()] } },
    { dealerCode: 1 },
  ).lean();
  const dealerIdMap = new Map(dealersInDB.map((d) => [d.dealerCode as string, d._id]));

  // ── 2. Bulk upsert users / customers (5 → 30%) ────────────────────────────
  const userRowMap = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const email = rowEmail(row);
    if (!userRowMap.has(email)) userRowMap.set(email, row);
  }

  const userOps = [...userRowMap.entries()].map(([email, row]) => {
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

  try {
    await bulkWrite(User, userOps, async (done, totalOps) => {
      await onProgress?.(
        Math.round(total * (0.05 + (done / totalOps) * 0.25)),
        total,
        `Importing customers: ${done.toLocaleString()} / ${totalOps.toLocaleString()}`,
      );
    });
  } catch (err) {
    errors.push(`User upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Build email → _id lookup in 5000-record batches
  const userIdMap = new Map<string, unknown>();
  const allEmails = [...userRowMap.keys()];
  for (let i = 0; i < allEmails.length; i += 5000) {
    const users = await User.find(
      { email: { $in: allEmails.slice(i, i + 5000) } },
      { email: 1 },
    ).lean();
    for (const u of users) userIdMap.set(u.email as string, u._id);
  }

  // ── 3. Bulk upsert contracts (30 → 60%) ───────────────────────────────────
  const contractOps = rows.map((row) => {
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
            ...(row.sale_price?.trim()        && { salePrice:    parseFloat(row.sale_price)           || undefined }),
            ...(row.internal_cost?.trim()     && { internalCost: parseFloat(row.internal_cost)        || undefined }),
          },
          $setOnInsert: { homeKit: false },
        },
        upsert: true,
      },
    };
  });

  try {
    await bulkWrite(Contract, contractOps, async (done, totalOps) => {
      await onProgress?.(
        Math.round(total * (0.30 + (done / totalOps) * 0.30)),
        total,
        `Importing contracts: ${done.toLocaleString()} / ${totalOps.toLocaleString()}`,
      );
    });
  } catch (err) {
    errors.push(`Contract upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const allAgreementIds = [...new Set(rows.map(agreementId))];
  const imported        = allAgreementIds.length;

  // Build agreementId → contract _id for active contracts (needed for service records)
  const activeAgreementIds = [...new Set(
    rows.filter((r) => contractStatus(r) === "active").map(agreementId),
  )];
  const contractIdMap = new Map<string, unknown>();
  for (let i = 0; i < activeAgreementIds.length; i += 5000) {
    const batch = activeAgreementIds.slice(i, i + 5000);
    const contracts = await Contract.find(
      { agreementId: { $in: batch } },
      { agreementId: 1 },
    ).lean();
    for (const c of contracts) contractIdMap.set(c.agreementId as string, c._id);
  }

  // ── 4. Bulk upsert service records (60 → 80%) ─────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srOps: any[] = [];
  for (const row of rows) {
    if (contractStatus(row) !== "active") continue;

    const agId       = agreementId(row);
    const contractId = contractIdMap.get(agId);
    if (!contractId) continue;

    const email          = rowEmail(row);
    const code           = row.dealer_code?.trim();
    const coverageRaw    = row.coverage?.trim() ?? "";
    const plan           = PLAN_MAP[coverageRaw.toLowerCase()] ?? "Basic";
    const coverageType   = COVERAGE_TYPE[plan] ?? "exterior";
    const purchaseDate   = parseDate(row.contract_purchase_date) ?? new Date();
    const expirationDate = parseDate(row.expiration_date) ?? new Date();

    for (const scheduledDate of getApplicationSchedule(purchaseDate, expirationDate)) {
      srOps.push({
        updateOne: {
          filter: { contractId, scheduledDate },
          update: {
            $setOnInsert: {
              contractId,
              customerId:    userIdMap.get(email),
              dealerId:      dealerIdMap.get(code ?? ""),
              type:          coverageType,
              status:        "scheduled",
              scheduledDate,
              reminderSent:  false,
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (srOps.length > 0) {
    try {
      await bulkWrite(ServiceRecord, srOps, async (done, totalOps) => {
        await onProgress?.(
          Math.round(total * (0.60 + (done / totalOps) * 0.20)),
          total,
          `Generating service records: ${done.toLocaleString()} / ${totalOps.toLocaleString()}`,
        );
      }, SR_BATCH);
    } catch {
      // Non-fatal — service records can be rebuilt; don't fail the whole import
    }
  } else {
    await onProgress?.(Math.round(total * 0.80), total, "Service records are current");
  }

  // ── 5. Bulk upsert vehicles (80 → 100%) ───────────────────────────────────
  const vehicleOps = rows
    .filter((row) => row.vin?.trim())
    .map((row) => {
      const vin            = row.vin.trim().toUpperCase();
      const email          = rowEmail(row);
      const code           = row.dealer_code?.trim();
      const coverageRaw    = row.coverage?.trim() ?? "";
      const plan           = PLAN_MAP[coverageRaw.toLowerCase()] ?? "Basic";
      const coverageType   = COVERAGE_TYPE[plan] ?? "exterior";
      const purchaseDate   = parseDate(row.contract_purchase_date) ?? new Date();
      const expirationDate = parseDate(row.expiration_date) ?? new Date();
      const status         = contractStatus(row);

      return {
        updateOne: {
          filter: { vin },
          update: {
            $set: {
              customerId:        userIdMap.get(email),
              dealerId:          dealerIdMap.get(code ?? ""),
              year:              parseInt(row.vehicle_year ?? "0", 10) || 0,
              make:              row.vehicle_maker?.trim() || "",
              vehicleModel:      row.series_name?.trim() || row.model_code?.trim() || "",
              purchaseDate,
              coverageType,
              warrantyExpiresAt: expirationDate,
              active:            status === "active",
            },
          },
          upsert: true,
        },
      };
    });

  if (vehicleOps.length > 0) {
    try {
      await bulkWrite(Vehicle, vehicleOps, async (done, totalOps) => {
        await onProgress?.(
          Math.round(total * (0.80 + (done / totalOps) * 0.20)),
          total,
          `Importing vehicles: ${done.toLocaleString()} / ${totalOps.toLocaleString()}`,
        );
      });
    } catch (err) {
      errors.push(`Vehicle upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await onProgress?.(total, total, "Import complete");

  return {
    recordsTotal:    rows.length,
    recordsImported: imported,
    errors:          errors.length > 0 ? errors : undefined,
  };
}
