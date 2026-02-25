import Dealer from "@/models/Dealer";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import type { ImportResult } from "./index";

/**
 * ZIE CSV — columns: dealer_code, dealer_name, exterior_units, interior_units,
 * total_revenue, average_revenue
 */
export async function importZIE(
  rows: Record<string, string>[],
  year: number,
  month: number
): Promise<ImportResult> {
  let imported = 0;

  for (const row of rows) {
    try {
      const dealerCode = row["dealer_code"]?.trim();
      if (!dealerCode) continue;

      const dealer = await Dealer.findOne({ dealerCode });
      if (!dealer) continue;

      const exteriorUnits = parseNum(row["exterior_units"]);
      const interiorUnits = parseNum(row["interior_units"]);
      const totalRevenue = parseFloat(row["total_revenue"] ?? "0") || 0;
      const avgRevenue = parseFloat(row["average_revenue"] ?? "0") || 0;

      await DealerMonthlyStats.findOneAndUpdate(
        { dealerId: dealer._id, year, month },
        {
          $set: {
            "stats.exteriorUnits": exteriorUnits,
            "stats.interiorUnits": interiorUnits,
            "stats.totalRevenue": totalRevenue,
            "stats.avgRevenue": avgRevenue,
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

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseInt(val.replace(/[^0-9.-]/g, ""), 10) || 0;
}
