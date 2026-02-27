"use client";
import { useEffect, useState } from "react";

interface Period {
  period: string; // "YYYY-MM"
  count: number;
}

interface LiabilityData {
  total: number;
  periods: Period[];
}

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatPeriod(period: string) {
  const [year, month] = period.split("-");
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

function fmt(cents: number) {
  return `$${cents.toFixed(2)}`;
}

// Build dropdown options for cost: 0.01 to 1.00 in 0.01 steps
const COST_OPTIONS = Array.from({ length: 100 }, (_, i) =>
  parseFloat(((i + 1) * 0.01).toFixed(2))
);

export default function LiabilityClient() {
  const [data, setData] = useState<LiabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Inputs
  const [mailerPct, setMailerPct] = useState(50);
  const [costPerMailer, setCostPerMailer] = useState(0.50);
  const [costPerEmail, setCostPerEmail] = useState(0.10);

  const emailPct = 100 - mailerPct;

  useEffect(() => {
    fetch("/api/admin/liability")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError("Failed to load contract data."); setLoading(false); });
  }, []);

  // Per-row calculations
  function calcRow(count: number) {
    const mailCount = Math.round(count * mailerPct / 100);
    const emailCount = count - mailCount;
    const mailCost = mailCount * costPerMailer;
    const emailCost = emailCount * costPerEmail;
    return { mailCount, emailCount, mailCost, emailCost, total: mailCost + emailCost };
  }

  // Grand totals
  const grand = data?.periods.reduce(
    (acc, p) => {
      const r = calcRow(p.count);
      return {
        count: acc.count + p.count,
        mailCount: acc.mailCount + r.mailCount,
        emailCount: acc.emailCount + r.emailCount,
        mailCost: acc.mailCost + r.mailCost,
        emailCost: acc.emailCost + r.emailCost,
        total: acc.total + r.total,
      };
    },
    { count: 0, mailCount: 0, emailCount: 0, mailCost: 0, emailCost: 0, total: 0 }
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-[#1565a8] mb-6">Liability Calculator</h1>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 shadow-sm">
        <h2 className="font-semibold text-gray-700 mb-4 text-base">Mailing Parameters</h2>
        <div className="flex flex-wrap gap-8 items-end">

          {/* Mailer % */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Mailer %
            </label>
            <select
              value={mailerPct}
              onChange={(e) => setMailerPct(parseInt(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565a8]"
            >
              {Array.from({ length: 100 }, (_, i) => i + 1).map((v) => (
                <option key={v} value={v}>{v}%</option>
              ))}
            </select>
          </div>

          {/* Email % (read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Email %
            </label>
            <div className="border border-gray-200 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 min-w-[72px] text-center">
              {emailPct}%
            </div>
          </div>

          {/* Cost Per Mailer */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Cost Per Mailer
            </label>
            <select
              value={costPerMailer}
              onChange={(e) => setCostPerMailer(parseFloat(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565a8]"
            >
              {COST_OPTIONS.map((v) => (
                <option key={v} value={v}>${v.toFixed(2)}</option>
              ))}
            </select>
          </div>

          {/* Cost Per Email */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Cost Per Email
            </label>
            <select
              value={costPerEmail}
              onChange={(e) => setCostPerEmail(parseFloat(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1565a8]"
            >
              {COST_OPTIONS.map((v) => (
                <option key={v} value={v}>${v.toFixed(2)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results table */}
      {loading && (
        <div className="text-gray-500 text-sm">Loading contract data…</div>
      )}
      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}
      {data && !loading && (
        <>
          <div className="text-sm text-gray-500 mb-3">
            {data.total} active contract{data.total !== 1 ? "s" : ""} with future expiration dates
          </div>
          {data.periods.length === 0 ? (
            <div className="text-gray-400 text-sm">No active contracts found.</div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1565a8] text-white">
                    <th className="px-4 py-3 text-left font-semibold">Expiration Month</th>
                    <th className="px-4 py-3 text-right font-semibold">Contracts</th>
                    <th className="px-4 py-3 text-right font-semibold">Mailers ({mailerPct}%)</th>
                    <th className="px-4 py-3 text-right font-semibold">Emails ({emailPct}%)</th>
                    <th className="px-4 py-3 text-right font-semibold">Mailer Cost</th>
                    <th className="px-4 py-3 text-right font-semibold">Email Cost</th>
                    <th className="px-4 py-3 text-right font-semibold">Period Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.periods.map((p, i) => {
                    const r = calcRow(p.count);
                    return (
                      <tr key={p.period} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-2 font-medium text-gray-700">{formatPeriod(p.period)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{p.count.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{r.mailCount.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{r.emailCount.toLocaleString()}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{fmt(r.mailCost)}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{fmt(r.emailCost)}</td>
                        <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmt(r.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {grand && (
                  <tfoot>
                    <tr className="bg-[#1565a8] text-white font-bold">
                      <td className="px-4 py-3">TOTAL</td>
                      <td className="px-4 py-3 text-right">{grand.count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{grand.mailCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{grand.emailCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">{fmt(grand.mailCost)}</td>
                      <td className="px-4 py-3 text-right">{fmt(grand.emailCost)}</td>
                      <td className="px-4 py-3 text-right">{fmt(grand.total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
