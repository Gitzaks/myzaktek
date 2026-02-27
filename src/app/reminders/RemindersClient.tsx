"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

// Build month options: 3 years back → 1 year ahead
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

export default function RemindersClient() {
  const now = new Date();
  const [month, setMonth]                 = useState(now.getMonth() + 1);
  const [year, setYear]                   = useState(now.getFullYear());
  const [page, setPage]                   = useState(1);
  const [limit, setLimit]                 = useState(25);
  const [records, setRecords]             = useState<ReminderRecord[]>([]);
  const [total, setTotal]                 = useState(0);
  const [activeCustomers, setActiveCustomers] = useState(0);
  const [loading, setLoading]             = useState(false);
  const [sortKey, setSortKey]             = useState<SortKey>("name");
  const [sortDir, setSortDir]             = useState<"asc" | "desc">("asc");
  const [csvLoading, setCsvLoading]       = useState(false);

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

  // Reset to page 1 when month/year/limit changes
  useEffect(() => { setPage(1); }, [month, year, limit]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...records].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  async function handleCsvDownload() {
    setCsvLoading(true);
    try {
      const res = await fetch(`/api/reminders?month=${month}&year=${year}&format=csv`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mailers-${year}-${String(month).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setCsvLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  const selectedOption = `${month}-${year}`;
  const monthLabel     = `${MONTH_LABELS[month - 1]}, ${year}`;

  const COLS: { key: SortKey; label: string }[] = [
    { key: "name",        label: "Name" },
    { key: "address",     label: "Address" },
    { key: "phone",       label: "Phone" },
    { key: "agreement",   label: "Agreement" },
    { key: "plan",        label: "Plan" },
    { key: "beginsAt",    label: "Begins" },
    { key: "endsAt",      label: "Ends" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <div className="text-2xl font-bold">{total.toLocaleString()}</div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Reminders This Month</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <div className="text-2xl font-bold">{activeCustomers.toLocaleString()}</div>
              <div className="text-xs text-gray-500 uppercase font-semibold">Active Customers</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Month / year picker */}
          <select
            value={selectedOption}
            onChange={(e) => {
              const [m, y] = e.target.value.split("-").map(Number);
              setMonth(m);
              setYear(y);
            }}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm font-semibold text-gray-700 bg-white focus:outline-none focus:border-[#1565a8]"
          >
            {MONTH_OPTIONS.map((o) => (
              <option key={`${o.month}-${o.year}`} value={`${o.month}-${o.year}`}>
                {o.label}
              </option>
            ))}
          </select>

          {/* CSV download */}
          <button
            onClick={handleCsvDownload}
            disabled={csvLoading || total === 0}
            className="bg-[#1565a8] text-white text-sm font-semibold px-4 py-1.5 rounded hover:bg-[#1254a0] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {csvLoading ? "Generating…" : "Create CSV"}
          </button>
        </div>
      </div>

      {/* ── Nav tabs ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8 py-0 flex items-center gap-0">
        <button className="px-6 py-3 text-sm font-semibold text-white bg-[#1565a8] border-r border-[#1254a0]">
          Mailer List
        </button>
        <Link
          href="/customers"
          className="px-6 py-3 text-sm font-semibold text-[#1565a8] hover:bg-gray-50 border-r border-gray-200"
        >
          Customer Search
        </Link>
        <Link
          href="/liability"
          className="px-6 py-3 text-sm font-semibold text-[#1565a8] hover:bg-gray-50"
        >
          Liability Calculator
        </Link>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="px-8 py-4">
        <p className="text-sm text-gray-500 mb-3">
          This table lists all the mailers that will be sent in{" "}
          <span className="font-semibold">{monthLabel}</span>.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
        ) : (
          <>
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
                            {sortKey === col.key
                              ? sortDir === "asc" ? "▲" : "▼"
                              : "↕"}
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
                        <tr
                          key={r.agreementId}
                          className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}
                        >
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
                          <td className="px-4 py-2 text-gray-600 capitalize whitespace-nowrap">
                            {r.plan}
                          </td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.beginsAt}</td>
                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{r.endsAt}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Pagination footer ─────────────────────────────────────── */}
            <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none"
                >
                  {[10, 25, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span>records per page</span>
              </div>

              <span>
                {total === 0
                  ? "No records"
                  : `Showing ${from.toLocaleString()} to ${to.toLocaleString()} of ${total.toLocaleString()} records`}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  ‹
                </button>
                <span className="px-3 py-1 bg-[#1565a8] text-white rounded font-semibold">
                  {page}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-100"
                >
                  »
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
