import User from "@/models/User";
import Dealer from "@/models/Dealer";
import Contract from "@/models/Contract";
import type { ImportResult } from "./index";

/**
 * MPP (Mechanical Protection Plan) contract import.
 * Columns discovered from ZAKCNTRCTS CSV files.
 * Update column mappings once sample file is reviewed.
 */
export async function importMPP(rows: Record<string, string>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      // Map CSV columns to our schema
      // NOTE: column names will be updated once sample CSV is provided
      const agreementId = (row["AgreementID"] || row["Agreement"] || row["CONTRACT_NUM"] || "").trim().toUpperCase();
      const customerName = (row["CustomerName"] || row["Name"] || row["CUSTOMER_NAME"] || "").trim();
      const customerEmail = (row["Email"] || row["EMAIL"] || "").trim().toLowerCase();
      const customerPhone = (row["Phone"] || row["PHONE"] || "").trim().replace(/\D/g, "");
      const customerAddress = (row["Address"] || row["ADDRESS"] || "").trim();
      const dealerCode = (row["DealerCode"] || row["DEALER_CODE"] || "").trim();
      const plan = (row["Plan"] || row["PLAN"] || "Basic").trim();
      const beginsAt = row["BeginDate"] || row["BEGIN_DATE"] || row["Begins"];
      const endsAt = row["EndDate"] || row["END_DATE"] || row["Ends"];
      const purchaseDate = row["PurchaseDate"] || row["PURCHASE_DATE"] || beginsAt;
      const homeKit = ["y", "yes", "1", "true"].includes((row["HomeKit"] || "").toLowerCase());

      if (!agreementId) continue;

      // Find or create dealer
      let dealer = null;
      if (dealerCode) {
        dealer = await Dealer.findOne({ dealerCode });
      }

      // Find or create customer
      let customer = null;
      if (customerEmail) {
        customer = await User.findOne({ email: customerEmail, role: "customer" });
        if (!customer && customerName) {
          customer = await User.create({
            email: customerEmail || `${agreementId.toLowerCase()}@noemail.zaktek.com`,
            password: Math.random().toString(36).slice(2) + "Zak1!",
            name: customerName,
            role: "customer",
            dealerIds: dealer ? [dealer._id] : [],
          });
        }
      }

      // Upsert contract
      await Contract.findOneAndUpdate(
        { agreementId },
        {
          agreementId,
          customerId: customer?._id,
          dealerId: dealer?._id,
          plan: normalizePlan(plan),
          beginsAt: beginsAt ? new Date(beginsAt) : new Date(),
          endsAt: endsAt ? new Date(endsAt) : new Date(),
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          homeKit,
          status: "active",
        },
        { upsert: true, new: true }
      );

      imported++;
    } catch (err) {
      if (errors.length < 20) errors.push(`Row ${imported + errors.length + 1}: ${err instanceof Error ? err.message : String(err)}`);
      // skip bad rows, continue import
    }
  }

  return { recordsTotal: rows.length, recordsImported: imported, errors: errors.length > 0 ? errors : undefined };
}

function normalizePlan(raw: string): "Basic" | "Basic with Interior" | "Ultimate" {
  const lower = raw.toLowerCase();
  if (lower.includes("ultimate")) return "Ultimate";
  if (lower.includes("interior")) return "Basic with Interior";
  return "Basic";
}
