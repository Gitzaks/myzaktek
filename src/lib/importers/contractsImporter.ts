import bcrypt from "bcryptjs";
import Dealer from "@/models/Dealer";
import User from "@/models/User";
import Contract from "@/models/Contract";
import Vehicle from "@/models/Vehicle";
import ServiceRecord from "@/models/ServiceRecord";
import { getApplicationSchedule } from "@/lib/schedule";
import type { ImportResult } from "./index";

/**
 * ZAKCNTRCTS import — header row present, columns named exactly as they appear.
 * A–AL (38 columns): dealer_code … internal_cost
 *
 * Uses bulk operations (bulkWrite) throughout to handle large files efficiently.
 * Individual per-row DB calls would time out for files with 100k+ records.
 */

const PLAN_MAP: Record<string, "Basic" | "Basic with Interior" | "Ultimate" | "Ultimate with Interior"> = {
  "basic": "Basic",
  "basic with interior": "Basic with Interior",
  "ultimate": "Ultimate",
  "ultimate with interior": "Ultimate with Interior",
};

const COVERAGE_TYPE: Record<string, "exterior" | "interior" | "both"> = {
  "Basic": "exterior",
  "Basic with Interior": "both",
  "Ultimate": "both",
  "Ultimate with Interior": "both",
};

const BATCH = 1000;

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

async function bulkWrite<T>(
  model: { bulkWrite: (ops: T[], opts: object) => Promise<unknown> },
  ops: T[]
) {
  for (let i = 0; i < ops.length; i += BATCH) {
    await model.bulkWrite(ops.slice(i, i + BATCH), { ordered: false });
  }
}

export async function importContracts(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  if (rows.length === 0) return { recordsTotal: 0, recordsImported: 0 };

  const errors: string[] = [];
  const placeholderHash = await bcrypt.hash("zaktek-import-placeholder", 4);

  // ── 1. Bulk upsert dealers ─────────────────────────────────────────────────
  // Collect the first row seen for each unique dealer code to get address info.
  const dealerRowMap = new Map<string, Record<string, string>>();
  for (const row of rows) {
    const code = row.dealer_code?.trim();
    if (code && !dealerRowMap.has(code)) dealerRowMap.set(code, row);
  }

  const dealerOps = [...dealerRowMap.entries()].map(([code, row]) => ({
    updateOne: {
      filter: { dealerCode: code },
      update: {
        $set: {
          name: row.dealer_name?.trim(),
          address: row.dealer_address_1?.trim() || undefined,
          city: row.dealer_city?.trim(),
          state: row.dealer_state?.trim(),
          zip: row.dealer_zip_code?.trim(),
          dealerCode: code,
        },
        $setOnInsert: {
          email: `${code.toLowerCase()}@dealers.zaktek.com`,
          active: true,
        },
      },
      upsert: true,
    },
  }));

  try {
    await bulkWrite(Dealer, dealerOps);
  } catch (err) {
    errors.push(`Dealer upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Build dealer code → _id lookup
  const dealersInDB = await Dealer.find(
    { dealerCode: { $in: [...dealerRowMap.keys()] } },
    { dealerCode: 1 }
  ).lean();
  const dealerIdMap = new Map(dealersInDB.map((d) => [d.dealerCode as string, d._id]));

  // ── 2. Bulk upsert users ───────────────────────────────────────────────────
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
            name: fullName,
            phone: row.owner_phone?.trim() || undefined,
            address: row.owner_address_1?.trim() || undefined,
            city: row.owner_city?.trim() || undefined,
            state: row.owner_state?.trim() || undefined,
            zip: row.owner_zip_code?.trim() || undefined,
          },
          $setOnInsert: {
            email,
            password: placeholderHash,
            role: "customer",
            dealerIds: [],
            active: true,
          },
        },
        upsert: true,
      },
    };
  });

  try {
    await bulkWrite(User, userOps);
  } catch (err) {
    errors.push(`User upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Build email → _id lookup (batch $in queries for very large sets)
  const userIdMap = new Map<string, unknown>();
  const allEmails = [...userRowMap.keys()];
  for (let i = 0; i < allEmails.length; i += 5000) {
    const batch = allEmails.slice(i, i + 5000);
    const users = await User.find({ email: { $in: batch } }, { email: 1 }).lean();
    for (const u of users) userIdMap.set(u.email as string, u._id);
  }

  // ── 3. Bulk upsert contracts ───────────────────────────────────────────────
  const contractOps = rows.map((row) => {
    const code = row.dealer_code?.trim();
    const email = rowEmail(row);
    const agId = agreementId(row);
    const coverageRaw = row.coverage?.trim() ?? "";
    const plan = PLAN_MAP[coverageRaw.toLowerCase()] ?? "Basic";
    const status = contractStatus(row);
    const purchaseDate = parseDate(row.contract_purchase_date) ?? new Date();
    const expirationDate = parseDate(row.expiration_date) ?? new Date();

    return {
      updateOne: {
        filter: { agreementId: agId },
        update: {
          $set: {
            customerId: userIdMap.get(email),
            dealerId: dealerIdMap.get(code ?? ""),
            vin: row.vin?.trim().toUpperCase() || undefined,
            plan,
            status,
            beginsAt: purchaseDate,
            endsAt: expirationDate,
            purchaseDate,
          },
          $setOnInsert: { homeKit: false },
        },
        upsert: true,
      },
    };
  });

  try {
    await bulkWrite(Contract, contractOps);
  } catch (err) {
    errors.push(`Contract upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Count imported contracts
  const allAgreementIds = [...new Set(rows.map(agreementId))];
  let imported = 0;
  for (let i = 0; i < allAgreementIds.length; i += 5000) {
    imported += await Contract.countDocuments({
      agreementId: { $in: allAgreementIds.slice(i, i + 5000) },
    });
  }

  // Build agreementId → contract _id for service records
  const contractIdMap = new Map<string, unknown>();
  for (let i = 0; i < allAgreementIds.length; i += 5000) {
    const batch = allAgreementIds.slice(i, i + 5000);
    const contracts = await Contract.find(
      { agreementId: { $in: batch } },
      { agreementId: 1 }
    ).lean();
    for (const c of contracts) contractIdMap.set(c.agreementId as string, c._id);
  }

  // ── 4. Bulk upsert service records ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srOps: any[] = [];
  for (const row of rows) {
    const status = contractStatus(row);
    if (status !== "active") continue;

    const agId = agreementId(row);
    const contractId = contractIdMap.get(agId);
    if (!contractId) continue;

    const email = rowEmail(row);
    const code = row.dealer_code?.trim();
    const coverageRaw = row.coverage?.trim() ?? "";
    const plan = PLAN_MAP[coverageRaw.toLowerCase()] ?? "Basic";
    const coverageType = COVERAGE_TYPE[plan] ?? "exterior";
    const purchaseDate = parseDate(row.contract_purchase_date) ?? new Date();
    const expirationDate = parseDate(row.expiration_date) ?? new Date();

    for (const scheduledDate of getApplicationSchedule(purchaseDate, expirationDate)) {
      srOps.push({
        updateOne: {
          filter: { contractId, scheduledDate },
          update: {
            $setOnInsert: {
              contractId,
              customerId: userIdMap.get(email),
              dealerId: dealerIdMap.get(code ?? ""),
              type: coverageType,
              status: "scheduled",
              scheduledDate,
              reminderSent: false,
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (srOps.length > 0) {
    try {
      await bulkWrite(ServiceRecord, srOps);
    } catch {
      // non-fatal — service records can be rebuilt
    }
  }

  // ── 5. Bulk upsert vehicles ────────────────────────────────────────────────
  const vehicleOps = rows
    .filter((row) => row.vin?.trim())
    .map((row) => {
      const vin = row.vin.trim().toUpperCase();
      const email = rowEmail(row);
      const code = row.dealer_code?.trim();
      const coverageRaw = row.coverage?.trim() ?? "";
      const plan = PLAN_MAP[coverageRaw.toLowerCase()] ?? "Basic";
      const coverageType = COVERAGE_TYPE[plan] ?? "exterior";
      const purchaseDate = parseDate(row.contract_purchase_date) ?? new Date();
      const expirationDate = parseDate(row.expiration_date) ?? new Date();
      const status = contractStatus(row);

      return {
        updateOne: {
          filter: { vin },
          update: {
            $set: {
              customerId: userIdMap.get(email),
              dealerId: dealerIdMap.get(code ?? ""),
              year: parseInt(row.vehicle_year ?? "0", 10) || 0,
              make: row.vehicle_maker?.trim() || "",
              vehicleModel: row.series_name?.trim() || row.model_code?.trim() || "",
              purchaseDate,
              coverageType,
              warrantyExpiresAt: expirationDate,
              active: status === "active",
            },
          },
          upsert: true,
        },
      };
    });

  if (vehicleOps.length > 0) {
    try {
      await bulkWrite(Vehicle, vehicleOps);
    } catch (err) {
      errors.push(`Vehicle upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    recordsTotal: rows.length,
    recordsImported: imported,
    errors: errors.length > 0 ? errors : undefined,
  };
}
