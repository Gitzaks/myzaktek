import Dealer from "@/models/Dealer";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import type { ImportResult } from "./index";

/**
 * AutoPoint results CSV — columns: dme_name, list, ros, response, response_rate,
 * avg_cp_amount, avg_wp_amount, avg_total_pay, cp_amount, wp_amount,
 * total_amount, campaign_invest, sales_roi
 *
 * Dealers are matched by the exact name stored in the Dealer Master
 * (dealer.dmeDealer field). Dealers whose dmeDealer is "Combined"
 * are excluded from the map — their data rolls up into a parent dealer.
 */
export async function importAutoPoint(
  rows: Record<string, string>[],
  year: number,
  month: number
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  // Build a case-insensitive lookup map from dmeDealer name → dealer
  const allDealers = await Dealer.find({ active: true, dmeDealer: { $exists: true, $ne: "" } });
  const dealerMap = new Map<string, typeof allDealers[0]>();
  for (const d of allDealers) {
    if (!d.dmeDealer) continue;
    const key = d.dmeDealer.trim().toLowerCase();
    if (key === "combined") continue; // rolls up into parent — not in this CSV
    dealerMap.set(key, d);
  }

  for (const row of rows) {
    try {
      const dmeName = (row["dme_name"] ?? row["dealer_name"])?.trim();
      if (!dmeName) continue;

      const dealer = dealerMap.get(dmeName.toLowerCase());
      if (!dealer) {
        errors.push(`No dealer match for: "${dmeName}"`);
        continue;
      }

      const list           = parseNum(row["list"]);
      const ROs            = parseNum(row["ros"]);
      const response       = parseNum(row["response"]);
      const responseRate   = parseFloat(row["response_rate"]  ?? "0") || 0;
      const avgCPAmount    = parseFloat(row["avg_cp_amount"]  ?? "0") || 0;
      const avgWPAmount    = parseFloat(row["avg_wp_amount"]  ?? "0") || 0;
      const avgROTotalPay  = parseFloat(row["avg_total_pay"]  ?? "0") || 0;
      const cpAmount       = parseFloat(row["cp_amount"]      ?? "0") || 0;
      const wpAmount       = parseFloat(row["wp_amount"]      ?? "0") || 0;
      const fixedOpsRevenue = parseFloat(row["total_amount"]  ?? "0") || 0;
      const campaignInvest = parseFloat(row["campaign_invest"] ?? "0") || 0;
      const salesRoi       = parseFloat(row["sales_roi"]      ?? "0") || 0;

      await DealerMonthlyStats.findOneAndUpdate(
        { dealerId: dealer._id, year, month },
        {
          $set: {
            "stats.list":           list,
            "stats.ROs":            ROs,
            "stats.response":       response,
            "stats.responseRate":   responseRate,
            "stats.avgCPAmount":    avgCPAmount,
            "stats.avgWPAmount":    avgWPAmount,
            "stats.avgROTotalPay":  avgROTotalPay,
            "stats.cpAmount":       cpAmount,
            "stats.wpAmount":       wpAmount,
            "stats.fixedOpsRevenue": fixedOpsRevenue,
            "stats.campaignInvest": campaignInvest,
            "stats.salesRoi":       salesRoi,
          },
        },
        { upsert: true }
      );

      imported++;
    } catch (err) {
      if (errors.length < 20)
        errors.push(`Row ${imported + errors.length + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported, errors: errors.length > 0 ? errors : undefined };
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseInt(val.replace(/[^0-9.-]/g, ""), 10) || 0;
}
