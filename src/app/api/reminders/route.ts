import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectDB } from "@/lib/mongodb";
import Contract from "@/models/Contract";

/**
 * GET /api/reminders?month=2&year=2026&page=1&limit=25
 *
 * Returns the mailer list for a given month/year: active contracts where a
 * 6-month anniversary (skipping month-0 / purchase date) falls in that month.
 * Logic mirrors the AutoPoint file generator exactly.
 *
 * Add &format=csv to receive the full list as a downloadable CSV file.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "dealer", "regional"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const month      = parseInt(searchParams.get("month")  ?? String(now.getMonth() + 1)); // 1-based
  const year       = parseInt(searchParams.get("year")   ?? String(now.getFullYear()));
  const page       = Math.max(1, parseInt(searchParams.get("page")  ?? "1"));
  const limit      = Math.min(100, Math.max(10, parseInt(searchParams.get("limit") ?? "25")));
  const format     = searchParams.get("format"); // "csv" → full download

  const targetMonth = month - 1; // convert to 0-based JS month
  const cutoff      = new Date(year, targetMonth + 1, 0); // last day of target month

  // Load all active contracts — beginsAt only (lightweight, same as stats route)
  const [allActive, activeCustomers] = await Promise.all([
    Contract.find({ status: "active" }, { _id: 1, beginsAt: 1 }).lean(),
    Contract.countDocuments({ status: "active" }),
  ]);

  // Walk each contract's 6-month schedule; collect those due in the target month.
  // Skip month-0 (the purchase/begin date itself) — mirrors AutoPoint generator.
  type DueEntry = { id: mongoose.Types.ObjectId; beginsAt: Date };
  const due: DueEntry[] = [];
  for (const c of allActive) {
    const begin = new Date(c.beginsAt);
    const d = new Date(begin);
    while (d <= cutoff) {
      if (d > begin && d.getFullYear() === year && d.getMonth() === targetMonth) {
        due.push({ id: c._id as mongoose.Types.ObjectId, beginsAt: begin });
        break;
      }
      d.setMonth(d.getMonth() + 6);
    }
  }

  // Default sort: by beginsAt ascending (oldest contracts first)
  due.sort((a, b) => a.beginsAt.getTime() - b.beginsAt.getTime());

  const total   = due.length;
  const pageIds = format === "csv"
    ? due.map((e) => e.id)
    : due.slice((page - 1) * limit, page * limit).map((e) => e.id);

  // Fetch full contract + customer for the current page (or all, for CSV)
  const contracts = await Contract.find({ _id: { $in: pageIds as mongoose.Types.ObjectId[] } })
    .populate("customerId", "name phone address")
    .lean();

  // Re-sort to match the due order (MongoDB $in doesn't preserve order)
  const idOrder = new Map(pageIds.map((id, i) => [String(id), i]));
  contracts.sort((a, b) => (idOrder.get(String(a._id)) ?? 0) - (idOrder.get(String(b._id)) ?? 0));

  const records = contracts.map((c) => {
    const customer = c.customerId as unknown as Record<string, unknown> | null;
    const [agreement] = (c.agreementId ?? "").split("-");
    return {
      agreementId: c.agreementId,
      agreement:   agreement ?? c.agreementId,
      name:        (customer?.name    as string) ?? "",
      address:     (customer?.address as string) ?? "",
      phone:       (customer?.phone   as string) ?? "",
      plan:        c.plan,
      beginsAt:    fmtDate(c.beginsAt),
      endsAt:      fmtDate(c.endsAt),
    };
  });

  if (format === "csv") {
    const headers = ["Name", "Address", "Phone", "Agreement", "Plan", "Begins", "Ends"];
    const csvRows = [
      headers.join(","),
      ...records.map((r) =>
        [r.name, r.address, r.phone, r.agreement, r.plan, r.beginsAt, r.endsAt]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const filename = `mailers-${year}-${String(month).padStart(2, "0")}.csv`;
    return new NextResponse(csvRows.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return NextResponse.json({ records, total, page, limit, activeCustomers });
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
