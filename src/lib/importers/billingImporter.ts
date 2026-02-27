import Dealer from "@/models/Dealer";
import DealerMonthlyStats from "@/models/DealerMonthlyStats";
import type { ImportResult } from "./index";

/**
 * Billing CSV — columns: ZAKTEK_billing_name, minimum, billing_1, billing_2
 *
 * ZAKTEK_billing_name format: "Dealer Name (###)" where ### is the numeric
 * part of the dealer code (e.g. "Acura of Peoria (666)" → ZAK0666).
 * billing_1 = ZAKTEK billing amount
 * billing_2 = Stone Eagle billing amount
 */
export async function importBilling(
  rows: Record<string, string>[],
  year: number,
  month: number
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      // Keys are normalized to lowercase by the CSV parser in index.ts
      const billingName = row["zaktek_billing_name"]?.trim();
      if (!billingName) continue;

      // Extract first numeric code from parentheses: "ABC Nissan (704)" or
      // "Midway Auto Team (671 & 672)" → first number wins → "ZAK0704" / "ZAK0671"
      const codeMatch = billingName.match(/\((\d+)/);
      let dealer = null;

      if (codeMatch) {
        const dealerCode = "ZAK" + codeMatch[1].padStart(4, "0");
        dealer = await Dealer.findOne({ dealerCode });
        if (!dealer) {
          errors.push(`No dealer found for code: "${dealerCode}" (from "${billingName}")`);
          continue;
        }
      } else {
        // No (###) pattern — fall back to billingDealer name match from Dealer Master
        dealer = await Dealer.findOne({ billingDealer: { $regex: `^${billingName}$`, $options: "i" } });
        if (!dealer) {
          errors.push(`No dealer code or name match for: "${billingName}"`);
          continue;
        }
      }

      const minimum = parseFloat(row["minimum"] ?? "0") || 0;
      const zaktekBilling = parseFloat(row["billing_1"] ?? "0") || 0;
      const stoneEagleBilling = parseFloat(row["billing_2"] ?? "0") || 0;

      await DealerMonthlyStats.findOneAndUpdate(
        { dealerId: dealer._id, year, month },
        {
          $set: {
            "stats.minimum": minimum,
            "stats.ZAKTEKbilling": zaktekBilling,
            "stats.StoneEaglebilling": stoneEagleBilling,
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
