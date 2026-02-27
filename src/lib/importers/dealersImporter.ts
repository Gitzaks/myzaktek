import Dealer from "@/models/Dealer";
import type { ImportResult } from "./index";

/**
 * Dealer Master CSV — columns:
 *   dealer_code, combine_with, zie_dealer, units_dealer,
 *   billing_dealer, dme_dealer, zakcntrcts_dealer
 *   address, city, state, zip, phone  (optional — updated when present)
 *
 * Upserts dealers by dealer_code, storing per-report name aliases so that
 * other importers can do exact lookups instead of fragile fuzzy matching.
 * Address/phone fields are updated whenever non-empty values are present in
 * the CSV, so re-importing the Dealer List will keep them current.
 */
export async function importDealers(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const dealerCode = (row["dealer_code"] ?? row["dealercode"] ?? "").trim();
      if (!dealerCode) continue;

      // Pull every master-file column (CSV parser normalises keys to lowercase)
      const combineWith      = (row["combine_with"]      ?? "").trim() || undefined;
      const zieDealer        = (row["zie_dealer"]        ?? "").trim() || undefined;
      const unitsDealer      = (row["units_dealer"]      ?? "").trim() || undefined;
      const billingDealer    = (row["billing_dealer"]    ?? "").trim() || undefined;
      const dmeDealer        = (row["dme_dealer"]        ?? "").trim() || undefined;
      const zakCntrtsDealer  = (row["zakcntrcts_dealer"] ?? "").trim() || undefined;

      // Contact/location columns — update existing records when present in CSV
      const address = (row["address"] ?? "").trim() || undefined;
      const city    = (row["city"]    ?? "").trim() || undefined;
      const state   = (row["state"]   ?? "").trim() || undefined;
      const zip     = (row["zip"]     ?? row["zip_code"] ?? row["zipcode"] ?? "").trim() || undefined;
      const phone   = (row["phone"]   ?? row["phone_number"] ?? "").trim() || undefined;

      // Name priority: explicit dealer_name column > zakcntrcts_dealer column > preserve existing.
      // Using zakCntrtsDealer as the default source means a plain re-import of the
      // Dealer Master file is enough to repair names that were previously set to dealerCode.
      const nameFromCSV = (row["dealer_name"] ?? row["dealername"] ?? "").trim();
      const bestName    = nameFromCSV || zakCntrtsDealer; // undefined when both are absent

      await Dealer.findOneAndUpdate(
        { dealerCode },
        {
          $set: {
            dealerCode,
            ...(bestName && { name: bestName }),
            ...(combineWith     !== undefined && { combineWith }),
            ...(zieDealer       !== undefined && { zieDealer }),
            ...(unitsDealer     !== undefined && { unitsDealer }),
            ...(billingDealer   !== undefined && { billingDealer }),
            ...(dmeDealer       !== undefined && { dmeDealer }),
            ...(zakCntrtsDealer !== undefined && { zakCntrtsDealer }),
            // Contact fields — only overwrite when the CSV has a non-empty value
            ...(address !== undefined && { address }),
            ...(city    !== undefined && { city }),
            ...(state   !== undefined && { state }),
            ...(zip     !== undefined && { zip }),
            ...(phone   !== undefined && { phone }),
          },
          $setOnInsert: {
            // For brand-new records only: use best name or fall back to dealerCode
            ...(bestName ? {} : { name: dealerCode }),
            email: `${dealerCode.toLowerCase()}@dealers.zaktek.com`,
            // Defaults for required fields not provided in this row
            ...(address === undefined && { address: "" }),
            ...(city    === undefined && { city: "" }),
            ...(state   === undefined && { state: "" }),
            ...(zip     === undefined && { zip: "" }),
            ...(phone   === undefined && { phone: "" }),
            active: true,
          },
        },
        { upsert: true, new: true }
      );

      imported++;
    } catch (err) {
      if (errors.length < 20)
        errors.push(`Row ${imported + errors.length + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported, errors: errors.length > 0 ? errors : undefined };
}
