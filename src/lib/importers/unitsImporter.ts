import Dealer from "@/models/Dealer";
import type { IDealerDocument } from "@/models/Dealer";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import type { ImportResult } from "./index";

/**
 * Units CSV — columns: Dealership, newUnits, usedUnits, units
 * Matched to dealers by case-insensitive name comparison.
 */
export async function importUnits(
  rows: Record<string, string>[],
  year: number,
  month: number
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  // Load all dealers once for name matching
  const allDealers = await Dealer.find({ active: true });

  for (const row of rows) {
    try {
      // Keys are normalized to lowercase by the CSV parser in index.ts
      const dealerName = row["dealership"]?.trim();
      if (!dealerName) {
        errors.push(`Row ${imported + errors.length + 1}: missing Dealership name`);
        continue;
      }

      const dealer = findDealerByName(allDealers, dealerName);
      if (!dealer) {
        errors.push(`No dealer match for: "${dealerName}"`);
        continue;
      }

      const newUnits = parseNum(row["newunits"]);
      const usedUnits = parseNum(row["usedunits"]);
      const units = parseNum(row["units"]) || newUnits + usedUnits;

      await DealerMonthlyStats.findOneAndUpdate(
        { dealerId: dealer._id, year, month },
        {
          $set: {
            "stats.newUnits": newUnits,
            "stats.usedUnits": usedUnits,
            "stats.units": units,
          },
        },
        { upsert: true }
      );

      imported++;
    } catch (err) {
      errors.push(`Row ${imported + errors.length + 1}: ${err instanceof Error ? err.message : String(err)}`);
      // skip bad row
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported, errors: errors.length > 0 ? errors : undefined };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findDealerByName(
  dealers: IDealerDocument[],
  name: string
): IDealerDocument | undefined {
  const target = normalizeName(name);
  // Exact normalized match first
  let found = dealers.find((d) => normalizeName(d.name) === target);
  if (found) return found;
  // Partial match: file name contained in dealer name or vice versa
  found = dealers.find(
    (d) => normalizeName(d.name).includes(target) || target.includes(normalizeName(d.name))
  );
  return found;
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseInt(val.replace(/[^0-9.-]/g, ""), 10) || 0;
}
