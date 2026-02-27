"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { UserRole } from "@/types";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface Dealer { _id: string; name: string; dealerCode: string; logoUrl?: string }
interface MonthlyStat {
  month: number; year: number;
  stats: Record<string, number | undefined>;
}
interface Summary {
  activeCustomers: number; remindersThisMonth: number; monthlySales: number;
  totalImpactYTD: number; salesYTD: number; avgPerContract: number; avgInternalCost: number;
  contractRevenueYTD: number; exteriorPenetration: number; interiorPenetration: number;
  ROsYTD: number; avgROPay: number; totalRORevenueYTD: number; responseRate: number;
}

interface Props {
  dealers: Dealer[];
  userRole: UserRole;
  isAdmin: boolean;
}

function fmt(n: number) { return n.toLocaleString(); }
function fmtUSD(n: number) { return "$" + n.toLocaleString(); }
function fmtPct(n: number) { return n + "%"; }

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

export default function StatsClient({ dealers, isAdmin }: Props) {
  const [selectedDealerId, setSelectedDealerId] = useState(dealers[0]?._id ?? "");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [loading, setLoading] = useState(false);

  const selectedDealer = dealers.find((d) => d._id === selectedDealerId);

  useEffect(() => {
    if (!selectedDealerId) return;
    setLoading(true);
    fetch(`/api/stats?dealerId=${selectedDealerId}&year=${selectedYear}`)
      .then((r) => r.json())
      .then((data) => {
        setSummary(data.summary);
        setMonthly(data.monthly ?? []);
      })
      .finally(() => setLoading(false));
  }, [selectedDealerId, selectedYear]);

  // Build chart data arrays (12 months)
  function buildChartData(key: string) {
    return MONTHS.map((label, i) => {
      const m = monthly.find((x) => x.month === i + 1);
      return { name: label, value: m?.stats[key] ?? 0, missing: m?.stats.missingData };
    });
  }

  const revenueData = buildChartData("totalRevenue");
  const exteriorData = MONTHS.map((label, i) => {
    const m = monthly.find((x) => x.month === i + 1);
    return { name: label, exterior: m?.stats.exteriorUnits ?? 0, interior: m?.stats.interiorUnits ?? 0 };
  });
  const remindersData = buildChartData("list");
  const extPenData = MONTHS.map((label, i) => {
    const m = monthly.find((x) => x.month === i + 1);
    const units = m?.stats.units ?? 0;
    const ext = m?.stats.exteriorUnits ?? 0;
    return { name: label, value: units > 0 ? Math.round((ext / units) * 100) : 0 };
  });
  const intPenData = MONTHS.map((label, i) => {
    const m = monthly.find((x) => x.month === i + 1);
    const units = m?.stats.units ?? 0;
    const int_ = m?.stats.interiorUnits ?? 0;
    return { name: label, value: units > 0 ? Math.round((int_ / units) * 100) : 0 };
  });

  const ytdTotal = revenueData.reduce((a, d) => a + d.value, 0);
  const extYTD = exteriorData.reduce((a, d) => a + d.exterior, 0);
  const intYTD = exteriorData.reduce((a, d) => a + d.interior, 0);
  const remindersYTD = remindersData.reduce((a, d) => a + d.value, 0);
  const extPenAvg = extPenData.reduce((a, d) => a + d.value, 0) / 12;
  const intPenAvg = intPenData.reduce((a, d) => a + d.value, 0) / 12;

  return (
    <div className="pb-12">
      {/* Top stats + dealer selector */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <div className="text-2xl font-bold">{fmt(summary?.remindersThisMonth ?? 0)}</div>
              <div className="text-xs text-gray-500 uppercase">Reminders This Month</div>
              <Link href="/reminders" className="text-xs text-[#1565a8] hover:underline">Click to see list</Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <div className="text-2xl font-bold">{fmt(summary?.monthlySales ?? 0)}</div>
              <div className="text-xs text-gray-500 uppercase">Monthly Sales</div>
              <div className="text-xs text-gray-400">New Customers This Month</div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {selectedDealer?.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={selectedDealer.logoUrl}
              alt={selectedDealer.name}
              className="max-h-16 max-w-40 object-contain"
            />
          ) : selectedDealer ? (
            <div className="text-right">
              <div className="font-bold text-gray-700">{selectedDealer.name}</div>
              <div className="text-xs text-gray-400">{selectedDealer.dealerCode}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Dealer + Year selectors */}
      <div className="bg-gray-100 border-b border-gray-200 px-8 py-2 flex items-center gap-2">
        <select
          value={selectedDealerId}
          onChange={(e) => setSelectedDealerId(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:border-[#1565a8] bg-white"
        >
          {dealers.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>
        <span className="text-sm font-semibold text-gray-500">Dealers</span>
        <span className="text-gray-300 mx-1">|</span>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="border border-gray-300 rounded px-3 py-1.5 text-sm font-semibold text-gray-700 focus:outline-none focus:border-[#1565a8] bg-white"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <span className="text-sm font-semibold text-gray-500">Year</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      ) : !summary ? null : (
        <div className="px-8 py-6 space-y-8">
          {/* ZAKTEK Total Impact */}
          <div>
            <h2 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              ZAKTEK Total Impact
            </h2>
            <div className="border border-gray-200 rounded overflow-hidden">
              {/* Top row: active customers + total */}
              <div className="flex items-stretch border-b border-gray-200">
                <div className="flex items-center gap-3 px-6 py-4 border-r border-gray-200 bg-white">
                  <span className="text-2xl">👥</span>
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold">Active Customers</div>
                    <div className="text-3xl font-bold">{fmt(summary.activeCustomers)}</div>
                  </div>
                </div>
                <div className="flex-1" />
                <div className="flex items-center gap-3 px-6 py-4 border-l border-gray-200 bg-white">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">{fmtUSD(summary.totalImpactYTD)}</div>
                    <div className="text-xs text-gray-400">ZAKTEK Total Impact YTD</div>
                  </div>
                </div>
              </div>

              {/* Stats grid row 1 */}
              <div className="grid grid-cols-5 border-b border-gray-200">
                {[
                  { icon: "👥", label: "SALES", value: fmt(summary.salesYTD), sub: "New Sales YTD" },
                  { icon: "💰", label: "AVG SALE PRICE", value: fmtUSD(summary.avgPerContract), sub: "Average Contract Sales Price" },
                  { icon: "💲", label: "INTERNAL COST", value: fmtUSD(summary.avgInternalCost), sub: "Average Internal Cost" },
                  { icon: "📋", label: "CONTRACT REVENUE", value: fmtUSD(summary.contractRevenueYTD), sub: "Contract Revenue YTD", green: true },
                  { icon: "🚗", label: "PENETRATION", value: null, sub: null,
                    custom: (
                      <div className="text-xs text-gray-600">
                        <div>{fmtPct(summary.exteriorPenetration)} Exterior Penetration</div>
                        <div>{fmtPct(summary.interiorPenetration)} Interior Penetration</div>
                      </div>
                    )
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-r border-gray-200 last:border-r-0">
                    <span className="text-lg">{item.icon}</span>
                    <div>
                      <div className="text-xs text-gray-400 uppercase font-semibold">{item.label}</div>
                      {item.custom ?? (
                        <>
                          <div className={`text-base font-bold ${item.green ? "text-green-600" : "text-gray-800"}`}>
                            {item.value}
                          </div>
                          <div className="text-xs text-gray-400">{item.sub}</div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stats grid row 2 */}
              <div className="grid grid-cols-5">
                {[
                  { icon: "🔧", label: "ROs", value: fmt(summary.ROsYTD), sub: "ROs YTD" },
                  { icon: "💰", label: "$/RO", value: fmtUSD(summary.avgROPay), sub: "Average Customer Pay + Warranty" },
                  { icon: "💵", label: "TOTAL REVENUE", value: fmtUSD(summary.totalRORevenueYTD), sub: "Total RO Revenue YTD", green: true },
                  { icon: "📈", label: "RESPONSE RATE", value: fmtPct(Math.round(summary.responseRate * 100)), sub: "% Response Rate" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-r border-gray-200 last:border-r-0">
                    <span className="text-lg">{item.icon}</span>
                    <div>
                      <div className="text-xs text-gray-400 uppercase font-semibold">{item.label}</div>
                      <div className={`text-base font-bold ${item.green ? "text-green-600" : "text-gray-800"}`}>
                        {item.value}
                      </div>
                      <div className="text-xs text-gray-400">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* YTD Revenue Chart */}
          <div className="bg-white border border-gray-200 rounded p-4">
            <div className="text-center text-sm font-semibold text-[#1565a8] mb-4">
              YTD Total: {fmtUSD(ytdTotal)}
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"} />
                <Tooltip formatter={(v: unknown) => fmtUSD(v as number)} />
                <Bar dataKey="value" fill="#5BA3D9" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Contracts + Reminders */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded p-4">
              <div className="text-center text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 italic">
                CONTRACTS
              </div>
              <div className="text-center text-xs text-[#1565a8] mb-3">
                Exterior YTD Total: {fmt(extYTD)} | Interior YTD Total: {fmt(intYTD)}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={exteriorData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="exterior" fill="#5BA3D9" name="Exterior" />
                  <Line type="monotone" dataKey="interior" stroke="#22c55e" name="Interior" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-gray-200 rounded p-4">
              <div className="text-center text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 italic">
                REMINDERS
              </div>
              <div className="text-center text-xs text-[#1565a8] mb-3">
                YTD Total: {fmt(remindersYTD)}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={remindersData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#5BA3D9" name="Reminders" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Penetration charts */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded p-4">
              <div className="text-center text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 italic">
                EXTERIOR PENETRATION
              </div>
              <div className="text-center text-xs text-[#1565a8] mb-3">
                Average YTD: {Math.round(extPenAvg)}%
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={extPenData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => v + "%"} />
                  <Tooltip formatter={(v: unknown) => (v as number) + "%"} />
                  <Bar dataKey="value" fill="#5BA3D9" name="Ext. Penetration" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-gray-200 rounded p-4">
              <div className="text-center text-xs font-bold uppercase tracking-wide text-gray-500 mb-1 italic">
                INTERIOR PENETRATION
              </div>
              <div className="text-center text-xs text-[#1565a8] mb-3">
                Average YTD: {Math.round(intPenAvg)}%
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={intPenData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => v + "%"} />
                  <Tooltip formatter={(v: unknown) => (v as number) + "%"} />
                  <Bar dataKey="value" fill="#5BA3D9" name="Int. Penetration" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Source Data Table — admin only */}
          {isAdmin && monthly.length > 0 && (
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <p className="text-center text-xs text-red-500 py-2">
                * Indicates one or more month&apos;s data is missing
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-[#1565a8] text-white">
                      <th className="px-3 py-2 text-left font-semibold">Stat</th>
                      <th className="px-3 py-2 text-left font-semibold">Source</th>
                      {MONTHS.map((m) => (
                        <th key={m} className="px-3 py-2 text-right font-semibold">{m} &apos;{String(selectedYear).slice(2)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { key: "newUnits", label: "newUnits", source: "Units" },
                      { key: "usedUnits", label: "usedUnits", source: "Units" },
                      { key: "units", label: "units", source: "Units" },
                      { key: "exteriorUnits", label: "exteriorUnits", source: "ZIE" },
                      { key: "interiorUnits", label: "interiorUnits", source: "ZIE" },
                      { key: "totalRevenue", label: "totalRevenue", source: "ZIE" },
                      { key: "avgRevenue", label: "avgRevenue", source: "ZIE" },
                      { key: "minimum", label: "minimum", source: "Billing" },
                      { key: "ZAKTEKbilling", label: "ZAKTEKbilling", source: "Billing" },
                      { key: "StoneEaglebilling", label: "StoneEaglebilling", source: "Billing" },
                      { key: "list", label: "list", source: "AutoPoint" },
                      { key: "ROs", label: "ROs", source: "AutoPoint" },
                      { key: "response", label: "response", source: "AutoPoint" },
                      { key: "responseRate", label: "responseRate", source: "AutoPoint" },
                      { key: "avgCPAmount", label: "avgCPAmount", source: "AutoPoint" },
                      { key: "avgWPAmount", label: "avgWPAmount", source: "AutoPoint" },
                      { key: "avgROTotalPay", label: "avgROTotalPay", source: "AutoPoint" },
                      { key: "cpAmount", label: "cpAmount", source: "AutoPoint" },
                      { key: "wpAmount", label: "wpAmount", source: "AutoPoint" },
                      { key: "fixedOpsRevenue", label: "fixedOpsRevenue", source: "AutoPoint" },
                    ].map((row, ri) => (
                      <tr key={row.key} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-3 py-1.5 text-gray-700">{row.label}</td>
                        <td className="px-3 py-1.5 text-gray-500">{row.source}</td>
                        {MONTHS.map((_, mi) => {
                          const m = monthly.find((x) => x.month === mi + 1);
                          const val = m?.stats[row.key];
                          return (
                            <td key={mi} className={`px-3 py-1.5 text-right ${m?.stats.missingData ? "text-red-400" : "text-gray-700"}`}>
                              {val !== undefined ? (
                                row.key === "responseRate"
                                  ? Number(val).toFixed(2)
                                  : Number(val).toLocaleString()
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
