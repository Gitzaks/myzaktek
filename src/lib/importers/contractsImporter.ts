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

export async function importContracts(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  // Hash placeholder password once — customers can't log in until they reset
  const placeholderHash = await bcrypt.hash("zaktek-import-placeholder", 4);

  for (const row of rows) {
    try {
      const dealerCode = row.dealer_code?.trim();
      if (!dealerCode) continue;

      // ── 1. Upsert Dealer ───────────────────────────────────────────────
      const dealer = await Dealer.findOneAndUpdate(
        { dealerCode },
        {
          $set: {
            name: row.dealer_name?.trim(),
            address: row.dealer_address_1?.trim() || undefined,
            city: row.dealer_city?.trim(),
            state: row.dealer_state?.trim(),
            zip: row.dealer_zip_code?.trim(),
            dealerCode,
          },
          $setOnInsert: {
            email: `${dealerCode.toLowerCase()}@dealers.zaktek.com`,
            active: true,
          },
        },
        { upsert: true, new: true }
      );

      // ── 2. Upsert Customer (User) ───────────────────────────────────────
      const rawEmail = row.email_address?.trim().toLowerCase();
      const email = rawEmail || `${row.agreement?.trim()}-${row.agreement_suffix?.trim()}@noemail.zaktek.com`;
      const fullName = `${row.owner_first_name?.trim() ?? ""} ${row.owner_last_name?.trim() ?? ""}`.trim();

      const customer = await User.findOneAndUpdate(
        { email },
        {
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
        { upsert: true, new: true }
      );

      // ── 3. Upsert Contract ─────────────────────────────────────────────
      const agreementId = `${row.agreement?.trim()}-${row.agreement_suffix?.trim()}`;
      const coverageRaw = row.coverage?.trim() ?? "";
      const plan = PLAN_MAP[coverageRaw.toLowerCase()] ?? "Basic";
      const status = contractStatus(row);
      const purchaseDate = parseDate(row.contract_purchase_date) ?? new Date();
      const expirationDate = parseDate(row.expiration_date) ?? new Date();

      const contract = await Contract.findOneAndUpdate(
        { agreementId },
        {
          $set: {
            customerId: customer._id,
            dealerId: dealer._id,
            vin: row.vin?.trim().toUpperCase() || undefined,
            plan,
            status,
            beginsAt: purchaseDate,
            endsAt: expirationDate,
            purchaseDate,
          },
          $setOnInsert: { homeKit: false },
        },
        { upsert: true, new: true }
      );

      // ── 4. Upsert ServiceRecords (bi-annual schedule) ──────────────────
      if (status === "active" && contract) {
        const coverageType = COVERAGE_TYPE[plan] ?? "exterior";
        const scheduleDates = getApplicationSchedule(purchaseDate, expirationDate);
        if (scheduleDates.length > 0) {
          const ops = scheduleDates.map((scheduledDate) => ({
            updateOne: {
              filter: { contractId: contract._id, scheduledDate },
              update: {
                $setOnInsert: {
                  contractId: contract._id,
                  customerId: customer._id,
                  dealerId: dealer._id,
                  type: coverageType,
                  status: "scheduled" as const,
                  scheduledDate,
                  reminderSent: false,
                },
              },
              upsert: true,
            },
          }));
          await ServiceRecord.bulkWrite(ops, { ordered: false });
        }
      }

      // ── 5. Upsert Vehicle ──────────────────────────────────────────────
      const vin = row.vin?.trim().toUpperCase();
      if (vin) {
        const vehicleYear = parseInt(row.vehicle_year ?? "0", 10) || 0;
        const coverageType = COVERAGE_TYPE[coverageRaw] ?? "exterior";

        await Vehicle.findOneAndUpdate(
          { vin },
          {
            $set: {
              customerId: customer._id,
              dealerId: dealer._id,
              year: vehicleYear,
              make: row.vehicle_maker?.trim() || "",
              vehicleModel: row.series_name?.trim() || row.model_code?.trim() || "",
              purchaseDate,
              coverageType,
              warrantyExpiresAt: expirationDate,
              active: status === "active",
            },
          },
          { upsert: true }
        );
      }

      imported++;
    } catch (err) {
      if (errors.length < 20) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Row ${imported + errors.length + 1}: ${msg}`);
      }
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported, errors: errors.length > 0 ? errors : undefined };
}
