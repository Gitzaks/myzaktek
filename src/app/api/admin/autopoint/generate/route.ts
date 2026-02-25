import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";
import AutoPointExport from "@/models/AutoPointExport";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import Papa from "papaparse";

const UPLOAD_DIR = join(process.cwd(), "uploads", "autopoint");

/**
 * Generates an AutoPoint mailer CSV.
 * Finds all active customers whose 6-month service reminder is due this month.
 */
export async function POST() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();

  // Find active contracts — customers due for their 6-month reapplication
  const contracts = await Contract.find({ status: "active" })
    .populate("customerId", "name email phone address city state zip")
    .populate("dealerId", "name dealerCode address city state zip phone")
    .lean();

  // Find customers whose 6-month re-application is due NEXT month.
  // We send the mailer one month early so customers receive it before they're due.
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const dueContracts = contracts.filter((c) => {
    const begin = new Date(c.beginsAt);
    const monthsUntilNext =
      (next.getFullYear() - begin.getFullYear()) * 12 + (next.getMonth() - begin.getMonth());
    return monthsUntilNext > 0 && monthsUntilNext % 6 === 0;
  });

  // Build CSV rows
  const rows = dueContracts.map((c) => {
    const customer = c.customerId as unknown as Record<string, string> | null;
    const dealer = c.dealerId as unknown as Record<string, string> | null;
    return {
      AgreementID: c.agreementId,
      CustomerName: customer?.name ?? "",
      Email: customer?.email ?? "",
      Phone: customer?.phone ?? "",
      Address: customer?.address ?? "",
      City: customer?.city ?? "",
      State: customer?.state ?? "",
      Zip: customer?.zip ?? "",
      Plan: c.plan,
      BeginsAt: c.beginsAt,
      EndsAt: c.endsAt,
      DealerName: dealer?.name ?? "",
      DealerCode: dealer?.dealerCode ?? "",
      DealerAddress: dealer?.address ?? "",
      DealerCity: dealer?.city ?? "",
      DealerState: dealer?.state ?? "",
      DealerPhone: dealer?.phone ?? "",
    };
  });

  const csv = Papa.unparse(rows);

  // Generate filename: AP-YYYYMMDDHHMMSS.csv
  const ts = now
    .toISOString()
    .replace(/[-:T]/g, "")
    .replace(/\..+/, "");
  const filename = `AP-${ts}.csv`;

  await mkdir(UPLOAD_DIR, { recursive: true });
  const storagePath = join(UPLOAD_DIR, filename);
  await writeFile(storagePath, csv, "utf-8");

  const record = await AutoPointExport.create({
    filename,
    generatedBy: session.user.id,
    recordCount: rows.length,
    storagePath,
  });

  return NextResponse.json(record, { status: 201 });
}
