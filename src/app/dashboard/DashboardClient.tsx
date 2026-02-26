"use client";
import { useState, useEffect, useCallback } from "react";
import StatsBar from "@/components/shared/StatsBar";
import DataNote from "@/components/shared/DataNote";
import type { UserRole } from "@/types";

interface CustomerRow {
  _id: string;
  agreementId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  dealerName: string;
  plan: string;
  beginsAt: string;
  endsAt: string;
  homeKit: boolean;
}

interface Props {
  initialStats: { activeCustomers: number; remindersThisMonth: number; monthlySales: number };
  userRole: UserRole;
  userDealerIds: string[];
  lastUpdate?: string;
}

const PLANS = ["All Plans", "Basic", "Basic with Interior", "Ultimate"];
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export default function DashboardClient({ initialStats, userRole, userDealerIds, lastUpdate }: Props) {
  const [tab, setTab] = useState<"list" | "search">("list");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [dealerFilter, setDealerFilter] = useState("");
  const [dealers, setDealers] = useState<{ _id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch dealers for filter dropdown
  useEffect(() => {
    if (userRole === "admin" || userRole === "regional") {
      fetch("/api/dealers?limit=500")
        .then((r) => r.json())
        .then((d) => setDealers(d.rows ?? []));
    }
  }, [userRole]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(dealerFilter && { dealerId: dealerFilter }),
      ...(search && { search }),
    });
    const res = await fetch(`/api/customers?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, limit, dealerFilter, search]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  async function downloadCSV() {
    const params = new URLSearchParams({
      limit: "10000",
      ...(dealerFilter && { dealerId: dealerFilter }),
      ...(search && { search }),
      format: "csv",
    });
    const res = await fetch(`/api/customers/export?${params}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Stats Bar */}
      <StatsBar
        remindersThisMonth={initialStats.remindersThisMonth}
        monthlySales={initialStats.monthlySales}
      />

      {/* Data Note */}
      <DataNote lastUpdate={lastUpdate} />

      <div className="p-6">
        {/* Active Customers + Tabs */}
        <div className="flex items-stretch gap-0 mb-4 border border-gray-200 rounded overflow-hidden">
          {/* Active Customers block */}
          <div className="flex items-center gap-4 px-6 py-4 bg-white border-r border-gray-200">
            <div className="text-[#1565a8] text-2xl">👥</div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide font-bold">Active Customers</div>
              <div className="text-4xl font-bold text-gray-800">
                {initialStats.activeCustomers.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <button
            onClick={() => setTab("list")}
            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold border-r border-gray-200 transition-colors ${
              tab === "list"
                ? "bg-[#1565a8] text-white"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>📋</span> Customer List
          </button>
          <button
            onClick={() => setTab("search")}
            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold transition-colors ${
              tab === "search"
                ? "bg-[#1565a8] text-white"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>🔍</span> Customer Search
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          This table lists all your active customers in our ZAKTEK database. Click a customer name
          to view or edit their information.
        </p>

        {/* Search form (shown when search tab active) */}
        {tab === "search" && (
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email…"
              className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 max-w-sm focus:outline-none focus:border-[#1565a8]"
            />
            <button
              type="submit"
              className="bg-[#1565a8] text-white px-4 py-2 rounded text-sm hover:bg-[#0f4f8a]"
            >
              Search
            </button>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded text-sm hover:bg-gray-100"
              >
                Clear
              </button>
            )}
          </form>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {(userRole === "admin" || userRole === "regional") && (
              <select
                value={dealerFilter}
                onChange={(e) => { setDealerFilter(e.target.value); setPage(1); }}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none"
              >
                <option value="">All Dealers</option>
                {dealers.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            )}
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none"
            >
              {PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} Records Per Page</option>
              ))}
            </select>
          </div>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            ⬇ Download Customer List (CSV)
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                {["Name", "Address", "Phone", "Agreement", "Plan", "Dealer", "Begins", "Ends", "Home Kit"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                    {h} {["Name", "Address", "Agreement", "Begins", "Ends", "Home Kit"].includes(h) ? "↕" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400">No records found.</td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row._id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2">
                      <a href={`/customers/${row._id}`} className="text-[#1565a8] hover:underline font-medium">
                        {row.customerName}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{row.customerAddress}</td>
                    <td className="px-4 py-2 text-gray-700">{row.customerPhone}</td>
                    <td className="px-4 py-2">
                      <a href={`/contracts/${row._id}`} className="text-[#1565a8] hover:underline">
                        {row.agreementId}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-700">{row.plan}</td>
                    <td className="px-4 py-2 text-gray-700">{row.dealerName}</td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                      {new Date(row.beginsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                      {new Date(row.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-block w-3 h-3 rounded-full ${row.homeKit ? "bg-red-500" : "bg-gray-300"}`} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
          <span>
            Showing {Math.min((page - 1) * limit + 1, total).toLocaleString()} to{" "}
            {Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()} records
          </span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 rounded border text-sm ${
                    p === page
                      ? "bg-[#1565a8] text-white border-[#1565a8]"
                      : "border-gray-300 hover:bg-gray-100"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            {totalPages > 5 && (
              <button
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
