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

  // Load all dealers once for name matching
  const allDealers = await Dealer.find({ active: true });

  for (const row of rows) {
    try {
      const dealerName = row["Dealership"]?.trim();
      if (!dealerName) continue;

      const dealer = findDealerByName(allDealers, dealerName);
      if (!dealer) continue;

      const newUnits = parseNum(row["newUnits"]);
      const usedUnits = parseNum(row["usedUnits"]);
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
    } catch {
      // skip bad row
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported };
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
