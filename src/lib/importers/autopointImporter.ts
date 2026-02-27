import Dealer from "@/models/Dealer";
import type { IDealerDocument } from "@/models/Dealer";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import type { ImportResult } from "./index";

/**
 * AutoPoint results CSV — columns: dme_name, list, ros, response, response_rate,
 * avg_cp_amount, avg_wp_amount, avg_total_pay, cp_amount, wp_amount,
 * total_amount, campaign_invest, sales_roi
 *
 * One row per dealer. Matched by case-insensitive dealer name.
 */
export async function importAutoPoint(
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
      const dmeName = row["dme_name"]?.trim();
      if (!dmeName) continue;

      const dealer = findDealerByName(allDealers, dmeName);
      if (!dealer) continue;

      const list = parseNum(row["list"]);
      const ROs = parseNum(row["ros"]);
      const response = parseNum(row["response"]);
      const responseRate = parseFloat(row["response_rate"] ?? "0") || 0;
      const avgCPAmount = parseFloat(row["avg_cp_amount"] ?? "0") || 0;
      const avgWPAmount = parseFloat(row["avg_wp_amount"] ?? "0") || 0;
      const avgROTotalPay = parseFloat(row["avg_total_pay"] ?? "0") || 0;
      const cpAmount = parseFloat(row["cp_amount"] ?? "0") || 0;
      const wpAmount = parseFloat(row["wp_amount"] ?? "0") || 0;
      const fixedOpsRevenue = parseFloat(row["total_amount"] ?? "0") || 0;
      const campaignInvest = parseFloat(row["campaign_invest"] ?? "0") || 0;
      const salesRoi = parseFloat(row["sales_roi"] ?? "0") || 0;

      await DealerMonthlyStats.findOneAndUpdate(
        { dealerId: dealer._id, year, month },
        {
          $set: {
            "stats.list": list,
            "stats.ROs": ROs,
            "stats.response": response,
            "stats.responseRate": responseRate,
            "stats.avgCPAmount": avgCPAmount,
            "stats.avgWPAmount": avgWPAmount,
            "stats.avgROTotalPay": avgROTotalPay,
            "stats.cpAmount": cpAmount,
            "stats.wpAmount": wpAmount,
            "stats.fixedOpsRevenue": fixedOpsRevenue,
            "stats.campaignInvest": campaignInvest,
            "stats.salesRoi": salesRoi,
          },
        },
        { upsert: true }
      );

      imported++;
    } catch (err) {
      if (errors.length < 20) errors.push(`Row ${imported + errors.length + 1}: ${err instanceof Error ? err.message : String(err)}`);
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
  let found = dealers.find((d) => normalizeName(d.name) === target);
  if (found) return found;
  found = dealers.find(
    (d) => normalizeName(d.name).includes(target) || target.includes(normalizeName(d.name))
  );
  return found;
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseInt(val.replace(/[^0-9.-]/g, ""), 10) || 0;
}
