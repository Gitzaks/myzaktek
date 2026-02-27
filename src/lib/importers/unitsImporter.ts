import Dealer from "@/models/Dealer";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import type { ImportResult } from "./index";

/**
 * Units CSV — columns: Dealership, newUnits, usedUnits, units
 *
 * Dealers are matched by the exact name stored in the Dealer Master
 * (dealer.unitsDealer field). Dealers whose unitsDealer is "Combined"
 * are excluded from the map — their data rolls up into a parent dealer
 * and they do not appear in this CSV.
 */
export async function importUnits(
  rows: Record<string, string>[],
  year: number,
  month: number
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  // Build a case-insensitive lookup map from unitsDealer name → dealer
  const allDealers = await Dealer.find({ active: true, unitsDealer: { $exists: true, $ne: "" } });
  const dealerMap = new Map<string, typeof allDealers[0]>();
  for (const d of allDealers) {
    if (!d.unitsDealer) continue;
    const key = d.unitsDealer.trim().toLowerCase();
    if (key === "combined") continue; // rolls up into parent — not in this CSV
    dealerMap.set(key, d);
  }

  for (const row of rows) {
    try {
      const dealerName = row["dealership"]?.trim();
      if (!dealerName) {
        errors.push(`Row ${imported + errors.length + 1}: missing Dealership name`);
        continue;
      }

      const dealer = dealerMap.get(dealerName.toLowerCase());
      if (!dealer) {
        errors.push(`No dealer match for: "${dealerName}"`);
        continue;
      }

      const newUnits  = parseNum(row["newunits"]);
      const usedUnits = parseNum(row["usedunits"]);
      const units     = parseNum(row["units"]) || newUnits + usedUnits;

      await DealerMonthlyStats.findOneAndUpdate(
        { dealerId: dealer._id, year, month },
        {
          $set: {
            "stats.newUnits":  newUnits,
            "stats.usedUnits": usedUnits,
            "stats.units":     units,
          },
        },
        { upsert: true }
      );

      imported++;
    } catch (err) {
      errors.push(`Row ${imported + errors.length + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported, errors: errors.length > 0 ? errors : undefined };
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseInt(val.replace(/[^0-9.-]/g, ""), 10) || 0;
}
