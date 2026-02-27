import Dealer from "@/models/Dealer";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import type { ImportResult } from "./index";

/**
 * AutoPoint results CSV — columns: dme_name (or dealer_name), list, ros,
 * response, response_rate, avg_cp_amount, avg_wp_amount, avg_total_pay,
 * cp_amount, wp_amount, total_amount, campaign_invest, sales_roi
 *
 * Dealers are matched by:
 *   1. dealer.dmeDealer  — the primary name in the AutoPoint file
 *   2. dealer.dmeAliases — additional names that roll up into this dealer
 *      (populated from the AutoPoint Rollup tab in the Dealer Master)
 *
 * When two stores share a dealer code (e.g. "Audi of Springfield" and
 * "BMW of Springfield" both roll up to ZAK0692) their rows are accumulated
 * in memory and written as one record with summed totals and recalculated
 * rates/averages.
 */
export async function importAutoPoint(
  rows: Record<string, string>[],
  year: number,
  month: number
): Promise<ImportResult> {
  const errors: string[] = [];

  // Build a case-insensitive lookup map: AutoPoint name → dealer
  const allDealers = await Dealer.find({
    active: true,
    $or: [
      { dmeDealer: { $exists: true, $ne: "" } },
      { dmeAliases: { $exists: true, $ne: [] } },
    ],
  });

  const dealerMap = new Map<string, typeof allDealers[0]>();
  for (const d of allDealers) {
    if (d.dmeDealer) {
      const key = d.dmeDealer.trim().toLowerCase();
      if (key !== "combined") dealerMap.set(key, d);
    }
    for (const alias of d.dmeAliases ?? []) {
      dealerMap.set(alias.trim().toLowerCase(), d);
    }
  }

  // Accumulate stats in memory keyed by dealerId so that multiple rows
  // targeting the same dealer (rollup case) are summed before writing.
  type Accum = {
    dealerId: (typeof allDealers[0])["_id"];
    list: number;
    ROs: number;
    response: number;
    cpAmount: number;
    wpAmount: number;
    fixedOpsRevenue: number;
    campaignInvest: number;
  };
  const accumMap = new Map<string, Accum>();

  for (const row of rows) {
    try {
      const dmeName = (row["dme_name"] ?? row["dealer_name"])?.trim();
      if (!dmeName) continue;

      const dealer = dealerMap.get(dmeName.toLowerCase());
      if (!dealer) {
        errors.push(`No dealer match for: "${dmeName}"`);
        continue;
      }

      const key = dealer._id.toString();
      const acc = accumMap.get(key) ?? {
        dealerId:       dealer._id,
        list:           0,
        ROs:            0,
        response:       0,
        cpAmount:       0,
        wpAmount:       0,
        fixedOpsRevenue: 0,
        campaignInvest: 0,
      };

      acc.list            += parseNum(row["list"]);
      acc.ROs             += parseNum(row["ros"]);
      acc.response        += parseNum(row["response"]);
      acc.cpAmount        += parseFloat(row["cp_amount"]      ?? "0") || 0;
      acc.wpAmount        += parseFloat(row["wp_amount"]      ?? "0") || 0;
      acc.fixedOpsRevenue += parseFloat(row["total_amount"]   ?? "0") || 0;
      acc.campaignInvest  += parseFloat(row["campaign_invest"] ?? "0") || 0;

      accumMap.set(key, acc);
    } catch (err) {
      if (errors.length < 20)
        errors.push(`Row error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Write one record per target dealer with recalculated rates/averages
  let imported = 0;
  for (const acc of accumMap.values()) {
    try {
      const responseRate  = acc.list  > 0 ? (acc.response / acc.list) * 100 : 0;
      const avgCPAmount   = acc.ROs   > 0 ? acc.cpAmount / acc.ROs : 0;
      const avgWPAmount   = acc.ROs   > 0 ? acc.wpAmount / acc.ROs : 0;
      const avgROTotalPay = acc.ROs   > 0 ? acc.fixedOpsRevenue / acc.ROs : 0;
      const salesRoi      = acc.campaignInvest > 0 ? acc.fixedOpsRevenue / acc.campaignInvest : 0;

      await DealerMonthlyStats.findOneAndUpdate(
        { dealerId: acc.dealerId, year, month },
        {
          $set: {
            "stats.list":            acc.list,
            "stats.ROs":             acc.ROs,
            "stats.response":        acc.response,
            "stats.responseRate":    responseRate,
            "stats.avgCPAmount":     avgCPAmount,
            "stats.avgWPAmount":     avgWPAmount,
            "stats.avgROTotalPay":   avgROTotalPay,
            "stats.cpAmount":        acc.cpAmount,
            "stats.wpAmount":        acc.wpAmount,
            "stats.fixedOpsRevenue": acc.fixedOpsRevenue,
            "stats.campaignInvest":  acc.campaignInvest,
            "stats.salesRoi":        salesRoi,
          },
        },
        { upsert: true }
      );
      imported++;
    } catch (err) {
      if (errors.length < 20)
        errors.push(`Write error for dealer ${acc.dealerId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported, errors: errors.length > 0 ? errors : undefined };
}

function parseNum(val: string | undefined): number {
  if (!val) return 0;
  return parseInt(val.replace(/[^0-9.-]/g, ""), 10) || 0;
}
