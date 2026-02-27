"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildMonthOptions() {
  const now = new Date();
  const options: { label: string; month: number; year: number }[] = [];
  for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      options.push({ label: `${MONTH_LABELS[m - 1]}, ${y}`, month: m, year: y });
    }
  }
  return options;
}
const MONTH_OPTIONS = buildMonthOptions();

interface ReminderRecord {
  agreementId: string;
  agreement: string;
  name: string;
  address: string;
  phone: string;
  plan: string;
  beginsAt: string;
  endsAt: string;
}

type SortKey = keyof ReminderRecord;

function getPageNums(current: number, total: number): number[] {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - 2);
  const end  = Math.min(total, start + 4);
  start      = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

interface Props { logoUrl: string | null; }

export default function RemindersClient({ logoUrl }: Props) {
  const now = new Date();
  const [month, setMonth]               = useState(now.getMonth() + 1);
  const [year, setYear]                 = useState(now.getFullYear());
  const [page, setPage]                 = useState(1);
  const [limit, setLimit]               = useState(10);
  const [records, setRecords]           = useState<ReminderRecord[]>([]);
  const [total, setTotal]               = useState(0);
  const [activeCustomers, setActiveCustomers] = useState(0);
  const [loading, setLoading]           = useState(false);
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("asc");
  const [csvLoading, setCsvLoading]     = useState(false);

  const fetchRecords = useCallback(() => {
    setLoading(true);
    fetch(`/api/reminders?month=${month}&year=${year}&page=${page}&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        setRecords(data.records ?? []);
        setTotal(data.total ?? 0);
        setActiveCustomers(data.activeCustomers ?? 0);
      })
      .finally(() => setLoading(false));
  }, [month, year, page, limit]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { setPage(1); }, [month, year, limit]);

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sorted = [...records].sort((a, b) => {
    const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  async function handleCsvDownload() {
    setCsvLoading(true);
    try {
      const res  = await fetch(`/api/reminders?month=${month}&year=${year}&format=csv`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `mailers-${year}-${String(month).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setCsvLoading(false); }
  }

  const totalPages  = Math.max(1, Math.ceil(total / limit));
  const from        = total === 0 ? 0 : (page - 1) * limit + 1;
  const to          = Math.min(page * limit, total);
  const pageNums    = getPageNums(page, totalPages);
  const selectedOpt = `${month}-${year}`;
  const monthLabel  = `${MONTH_LABELS[month - 1]}, ${year}`;

  const COLS: { key: SortKey; label: string }[] = [
    { key: "name",      label: "Name" },
    { key: "address",   label: "Address" },
    { key: "phone",     label: "Phone" },
    { key: "agreement", label: "Agreement" },
    { key: "plan",      label: "Plan" },
    { key: "beginsAt",  label: "Begins" },
    { key: "endsAt",    label: "Ends" },
  ];

  return (
    <div className="flex flex-col">

      {/* ── 2×2 header grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2">

        {/* Top-left: Reminders count */}
        <div className="bg-white border-r border-b border-gray-300 px-10 py-8 flex items-center gap-6">
          <span className="text-5xl select-none">📬</span>
          <div>
            <div className="text-5xl font-bold text-gray-900 leading-none tabular-nums">
              {total.toLocaleString()}
            </div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mt-2">
              Reminders This Month
            </div>
          </div>
        </div>

        {/* Top-right: Month selector + optional dealer logo */}
        <div className="bg-[#1565a8] border-b border-gray-300 px-10 py-8 flex items-center relative">
          {logoUrl && (
            <div className="absolute top-4 right-5">
              <Image
                src={logoUrl}
                alt="Dealer logo"
                width={144}
                height={56}
                className="object-contain max-h-14 w-auto"
                unoptimized
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <span className="text-5xl select-none">📅</span>
            <div className="flex items-center gap-1">
              <select
                value={selectedOpt}
                onChange={(e) => {
                  const [m, y] = e.target.value.split("-").map(Number);
                  setMonth(m);
                  setYear(y);
                }}
                className="bg-transparent text-white text-2xl font-bold focus:outline-none cursor-pointer"
                style={{ appearance: "none", WebkitAppearance: "none" }}
              >
                {MONTH_OPTIONS.map((o) => (
                  <option
                    key={`${o.month}-${o.year}`}
                    value={`${o.month}-${o.year}`}
                    style={{ background: "#1565a8", color: "#fff" }}
                  >
                    {o.label}
                  </option>
                ))}
              </select>
              <span className="text-white/80 text-lg pointer-events-none">▼</span>
            </div>
          </div>
        </div>

        {/* Bottom-left: Active customers */}
        <div className="bg-white border-r border-gray-300 px-10 py-8 flex items-center gap-6">
          <span className="text-5xl select-none">👥</span>
          <div>
            <div className="text-5xl font-bold text-gray-900 leading-none tabular-nums">
              {activeCustomers.toLocaleString()}
            </div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mt-2">
              Active Customers
            </div>
          </div>
        </div>

        {/* Bottom-right: Navigation links */}
        <div className="bg-white border-gray-300 px-10 py-8 flex flex-col gap-3 justify-center">
          <button className="flex items-center gap-3 text-sm font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded w-full text-left transition-colors">
            <span className="text-[#1565a8]">📋</span> Mailer List
          </button>
          <Link
            href="/customers"
            className="flex items-center gap-3 text-sm font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded transition-colors"
          >
            <span className="text-[#1565a8]">🔍</span> Customer Search
          </Link>
          <Link
            href="/liability"
            className="flex items-center gap-3 text-sm font-semibold text-gray-800 bg-gray-100 hover:bg-gray-200 px-5 py-2.5 rounded transition-colors"
          >
            <span className="text-[#1565a8]">📊</span> Liability Calculator
          </Link>
        </div>

      </div>

      {/* ── Table section ────────────────────────────────────────────────── */}
      <div className="px-8 py-5">

        {/* Info + controls bar */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <p className="text-sm text-gray-700">
            This table lists all the mailers that will be sent in{" "}
            <span className="font-semibold">{monthLabel}</span>.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCsvDownload}
              disabled={csvLoading || total === 0}
              className="bg-[#1565a8] text-white text-sm font-semibold px-4 py-1.5 rounded hover:bg-[#1254a0] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {csvLoading ? "Generating…" : "Create CSV"}
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:border-[#1565a8]"
              >
                {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-sm text-gray-600">Records Per Page</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
        ) : (
          <>
            {/* Table */}
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-[#1565a8] text-white text-xs">
                      {COLS.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className="px-4 py-2.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap hover:bg-[#1254a0]"
                        >
                          {col.label}{" "}
                          <span className="opacity-60 text-[10px]">
                            {sortKey === col.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                          No mailers scheduled for {monthLabel}.
                        </td>
                      </tr>
                    ) : (
                      sorted.map((r, i) => (
                        <tr key={r.agreementId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{r.name}</td>
                          <td className="px-4 py-2 text-gray-600">{r.address}</td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.phone}</td>
                          <td className="px-4 py-2">
                            <Link
                              href={`/contracts/${r.agreementId}`}
                              className="text-[#1565a8] hover:underline font-medium"
                            >
                              {r.agreement}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-gray-600 capitalize whitespace-nowrap">{r.plan}</td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.beginsAt}</td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.endsAt}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between mt-3 text-sm text-gray-600 flex-wrap gap-2">
              <span>
                {total === 0
                  ? "No records"
                  : `Showing ${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()} records`}
              </span>
              <div className="flex items-center gap-1">
                {pageNums.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 rounded text-sm font-semibold transition-colors ${
                      p === page
                        ? "bg-[#1565a8] text-white"
                        : "border border-gray-300 bg-white hover:bg-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {page < totalPages && (
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded text-sm font-semibold border border-gray-300 bg-white hover:bg-gray-100 ml-1"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
