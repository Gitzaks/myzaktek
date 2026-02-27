import Dealer from "@/models/Dealer";
import type { ImportResult } from "./index";

/**
 * Dealers CSV — columns: Dealer Code, Dealer Name
 * Upserts dealers by dealer code. Does not overwrite address/phone
 * fields already set on existing dealers.
 */
export async function importDealers(
  rows: Record<string, string>[]
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const dealerCode = (row["dealer_code"] ?? row["dealercode"] ?? "").trim();
      const name = (row["dealer_name"] ?? row["dealername"] ?? "").trim();
      if (!dealerCode || !name) continue;

      await Dealer.findOneAndUpdate(
        { dealerCode },
        {
          $set: { name, dealerCode },
          $setOnInsert: {
            email: `${dealerCode.toLowerCase()}@dealers.zaktek.com`,
            address: "",
            city: "",
            state: "",
            zip: "",
            phone: "",
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
