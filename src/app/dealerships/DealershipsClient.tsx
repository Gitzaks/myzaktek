"use client";
import { useState, useEffect, useCallback } from "react";
import StatsBar from "@/components/shared/StatsBar";
import DataNote from "@/components/shared/DataNote";

interface DealerRow {
  _id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  dealerCode: string;
}

export default function DealershipsClient({ lastUpdate }: { lastUpdate?: string }) {
  const [tab, setTab] = useState<"list" | "search">("list");
  const [rows, setRows] = useState<DealerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchDealers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search && { search }),
    });
    const res = await fetch(`/api/dealers?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, limit, search]);

  useEffect(() => {
    fetchDealers();
  }, [fetchDealers]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {/* Stats Bar — shows global totals for admin */}
      <StatsBar remindersThisMonth={0} monthlySales={0} />
      <DataNote lastUpdate={lastUpdate} />

      <div className="p-6">
        {/* Active Users + Tabs */}
        <div className="flex items-stretch gap-0 mb-4 border border-gray-200 rounded overflow-hidden">
          <div className="flex items-center gap-4 px-6 py-4 bg-white border-r border-gray-200">
            <div className="text-[#1565a8] text-2xl">👥</div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide font-bold">Active Users</div>
              <div className="text-4xl font-bold text-gray-800">{total.toLocaleString()}</div>
            </div>
          </div>

          <button
            onClick={() => setTab("list")}
            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold border-r border-gray-200 transition-colors ${
              tab === "list" ? "bg-[#1565a8] text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>📋</span> Dealer List
          </button>
          <button
            onClick={() => setTab("search")}
            className={`flex items-center gap-2 px-8 py-4 text-sm font-semibold transition-colors ${
              tab === "search" ? "bg-[#1565a8] text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <span>🔍</span> Dealership Search
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          This table lists all your dealer users in our ZAKTEK database. Click a dealership name to
          view or edit their information.
        </p>

        {/* Search form */}
        {tab === "search" && (
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by dealership name…"
              className="border border-gray-300 rounded px-3 py-2 text-sm flex-1 max-w-sm focus:outline-none focus:border-[#1565a8]"
            />
            <button type="submit" className="bg-[#1565a8] text-white px-4 py-2 rounded text-sm hover:bg-[#0f4f8a]">
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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none"
            >
              {[10, 25, 50].map((n) => (
                <option key={n} value={n}>{n} Records Per Page</option>
              ))}
            </select>
          </div>
          <a
            href="/admin/dealers/new"
            className="bg-[#1565a8] text-white px-4 py-2 rounded text-sm hover:bg-[#0f4f8a] transition-colors"
          >
            + Create a Dealership
          </a>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                {["Dealership ↕", "Address ↕", "Phone ↕", "Dealership Code ↕"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-400">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-400">No dealerships found.</td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row._id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-2">
                      <a href={`/dealerships/${row._id}`} className="text-[#1565a8] hover:underline font-medium uppercase">
                        {row.name}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-gray-700 uppercase">
                      {row.address}{row.city ? `, ${row.city}` : ""}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{row.phone}</td>
                    <td className="px-4 py-2 text-gray-700">{row.dealerCode}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
          <span>
            Showing {Math.min((page - 1) * limit + 1, total)} to {Math.min(page * limit, total)} of{" "}
            {total.toLocaleString()} records
          </span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = i + 1;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1 rounded border text-sm ${
                    p === page ? "bg-[#1565a8] text-white border-[#1565a8]" : "border-gray-300 hover:bg-gray-100"
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
