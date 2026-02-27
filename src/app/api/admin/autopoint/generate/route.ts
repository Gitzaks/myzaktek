import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";
import Vehicle from "@/models/Vehicle";
import AutoPointExport from "@/models/AutoPointExport";
import Papa from "papaparse";

/**
 * Generates an AutoPoint mailer CSV.
 *
 * Includes all active contracts where the customer's 6-month re-application
 * is due in the CURRENT calendar month.
 *
 * Columns match the AutoPoint / ZAKCNTRCTS format exactly:
 * company_code, dealer_code, dealer_name, dealer_address_1, dealer_address_2,
 * dealer_city, dealer_state, dealer_zip_code, dealer_phone, status_code,
 * agreement, agreement_suffix, owner_last_name, owner_first_name,
 * owner_address_1, owner_address_2, owner_city, owner_state, owner_zip_code,
 * owner_phone, coverage, coverage_option, coverage_months, coverage_miles,
 * expiration_mileage, deductible, vehicle_year, vin, beginning_mileage,
 * vehicle_maker, model_code, series_name, contract_purchase_date,
 * cancel_post_date, expiration_date, posted_date, email_address
 */
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  // First day of the CURRENT month — used to check if a 6-month anniversary falls this month
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day

  // Load all active contracts with customer and dealer populated
  const contracts = await Contract.find({ status: "active" })
    .populate("customerId", "name email phone address city state zip")
    .populate("dealerId", "name dealerCode address city state zip phone")
    .lean();

  // Filter to contracts where a 6-month application anniversary falls in the current month
  const dueContracts = contracts.filter((c) => {
    const begin = new Date(c.beginsAt);
    // Check every 6-month mark from begin date — if any lands in this month, include it
    const d = new Date(begin);
    while (d <= thisMonthEnd) {
      if (
        d.getFullYear() === thisMonthStart.getFullYear() &&
        d.getMonth() === thisMonthStart.getMonth() &&
        d > begin // skip the first application (month 0)
      ) {
        return true;
      }
      d.setMonth(d.getMonth() + 6);
    }
    return false;
  });

  // Bulk-load vehicles by VIN for all due contracts
  const vins = [...new Set(dueContracts.map((c) => c.vin).filter(Boolean))] as string[];
  const vehicleList = await Vehicle.find({ vin: { $in: vins } }).lean();
  const vehicleMap = new Map(vehicleList.map((v) => [v.vin, v]));

  // Build CSV rows
  const rows = dueContracts.map((c) => {
    const customer = c.customerId as Record<string, string> | null;
    const dealer   = c.dealerId   as Record<string, string> | null;
    const vehicle  = c.vin ? vehicleMap.get(c.vin) : undefined;

    // Split "First Last" → first name / last name
    const nameParts = (customer?.name ?? "").trim().split(/\s+/);
    const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] ?? "";
    const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";

    // Split agreementId "86119226-A" → agreement + suffix
    const [agreement, ...suffixParts] = (c.agreementId ?? "").split("-");
    const agreementSuffix = suffixParts.join("-");

    // Coverage months = full term between purchase and expiration
    const beginDate = new Date(c.beginsAt);
    const endDate   = new Date(c.endsAt);
    const coverageMonths =
      (endDate.getFullYear() - beginDate.getFullYear()) * 12 +
      (endDate.getMonth() - beginDate.getMonth());

    // Email — suppress internal placeholder addresses
    const email = (customer?.email ?? "").includes("@noemail.zaktek.com")
      ? ""
      : (customer?.email ?? "");

    return {
      company_code:           "ZAK",
      dealer_code:            dealer?.dealerCode ?? "",
      dealer_name:            dealer?.name ?? "",
      dealer_address_1:       dealer?.address ?? "",
      dealer_address_2:       "",
      dealer_city:            dealer?.city ?? "",
      dealer_state:           dealer?.state ?? "",
      dealer_zip_code:        dealer?.zip ?? "",
      dealer_phone:           dealer?.phone ?? "",
      status_code:            "A",
      agreement:              agreement ?? "",
      agreement_suffix:       agreementSuffix,
      owner_last_name:        lastName,
      owner_first_name:       firstName,
      owner_address_1:        customer?.address ?? "",
      owner_address_2:        "",
      owner_city:             customer?.city ?? "",
      owner_state:            customer?.state ?? "",
      owner_zip_code:         customer?.zip ?? "",
      owner_phone:            customer?.phone ?? "",
      coverage:               c.plan ?? "",
      coverage_option:        c.planCode ?? c.plan ?? "",
      coverage_months:        coverageMonths || "",
      coverage_miles:         c.maxMileage ?? "",
      expiration_mileage:     c.maxMileage ?? "",
      deductible:             c.deductible ?? 0,
      vehicle_year:           vehicle?.year ?? "",
      vin:                    c.vin ?? "",
      beginning_mileage:      c.beginMileage ?? "",
      vehicle_maker:          vehicle?.make ?? "",
      model_code:             vehicle?.vehicleModel ?? "",
      series_name:            vehicle?.vehicleModel ?? "",
      contract_purchase_date: fmtDate(c.purchaseDate),
      cancel_post_date:       "",
      expiration_date:        fmtDate(c.endsAt),
      posted_date:            fmtDate(c.purchaseDate),
      email_address:          email,
    };
  });

  const csv = Papa.unparse(rows);
  const fileData = Buffer.from(csv, "utf-8");

  // Filename: AP-YYYYMMDDHHMMSS.csv
  const ts = now.toISOString().replace(/[-:T]/g, "").replace(/\..+/, "");
  const filename = `AP-${ts}.csv`;

  const record = await AutoPointExport.create({
    filename,
    generatedBy: session.user.id,
    recordCount: rows.length,
    storagePath: `mongodb:${filename}`, // filesystem no longer used on Vercel
    fileData,
  });

  return NextResponse.json(
    { _id: record._id, filename: record.filename, recordCount: record.recordCount, createdAt: record.createdAt },
    { status: 201 }
  );
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  const mm   = String(dt.getMonth() + 1).padStart(2, "0");
  const dd   = String(dt.getDate()).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}
