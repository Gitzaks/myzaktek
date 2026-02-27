"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface LiabilityData {
  buckets: Record<string, number>;      // key = remaining count (string from JSON)
  totalCustomers: number;
  totalNotifications: number;
  twelveMonthNotifications: number;
}

function fmt(n: number)  { return Math.round(n).toLocaleString(); }
function fmtUSD(n: number) {
  return "$" + Math.round(n).toLocaleString();
}

// Range of cent values shown in cost dropdowns
const MAILER_COST_OPTIONS = Array.from({ length: 61 }, (_, i) => i + 30); // 30–90 ¢
const EMAIL_COST_OPTIONS  = Array.from({ length: 46 }, (_, i) => i + 5);  //  5–50 ¢

export default function LiabilityClient() {
  const [data, setData]               = useState<LiabilityData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [mailerPct, setMailerPct]     = useState(60);   // % sent as physical mailer
  const [mailerCost, setMailerCost]   = useState(57);   // cents per mailer
  const [emailCost, setEmailCost]     = useState(12);   // cents per email

  useEffect(() => {
    fetch("/api/liability")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Loading…
      </div>
    );
  }

  if (!data) return null;

  const emailPct = 100 - mailerPct;

  // Sorted bucket keys, descending (9, 8, 7, …, 1)
  const bucketKeys = Object.keys(data.buckets)
    .map(Number)
    .sort((a, b) => b - a);

  // ── Derived calculations ───────────────────────────────────────────────────
  const totalToSendMailer    = Math.round(data.totalNotifications * (mailerPct / 100));
  const totalToSendEmail     = data.totalNotifications - totalToSendMailer;
  const liabilityMailer      = (totalToSendMailer  * mailerCost) / 100;
  const liabilityEmail       = (totalToSendEmail   * emailCost)  / 100;
  const totalLiability       = liabilityMailer + liabilityEmail;

  const twelveToSendMailer   = Math.round(data.twelveMonthNotifications * (mailerPct / 100));
  const twelveToSendEmail    = data.twelveMonthNotifications - twelveToSendMailer;
  const twelveLiabilityMailer = (twelveToSendMailer * mailerCost) / 100;
  const twelveLiabilityEmail  = (twelveToSendEmail  * emailCost)  / 100;
  const twelveTotalLiability  = twelveLiabilityMailer + twelveLiabilityEmail;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <h1 className="text-lg font-bold text-gray-800">Liability Calculator</h1>
        </div>
        <Link href="/stats" className="text-xs italic text-[#1565a8] hover:underline">
          ← Back to Sales Graph
        </Link>
      </div>

      <div className="px-8 py-6 space-y-6">

        {/* ── Summary sentence ─────────────────────────────────────────── */}
        <p className="text-sm text-gray-700">
          The Zaktek program has a total of{" "}
          <span className="font-bold">{fmt(data.totalCustomers)}</span> customers
          with 1 or more notifications due.
        </p>

        {/* ── Bucket table ─────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-center text-sm">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                {bucketKeys.map((k) => (
                  <th key={k} className="px-4 py-2.5 font-bold border-r border-[#1254a0] last:border-r-0">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white">
                {bucketKeys.map((k) => (
                  <td key={k} className="px-4 py-3 font-semibold text-gray-800 border-r border-gray-200 last:border-r-0">
                    {fmt(data.buckets[String(k)] ?? 0)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── Summary stats row ────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "TOTAL NOTIFICATIONS",    value: fmt(data.totalNotifications) },
            { label: "TOTAL LIABILITY",         value: fmtUSD(totalLiability),      green: true },
            { label: "12-MONTH NOTIFICATIONS", value: fmt(data.twelveMonthNotifications) },
            { label: "12-MONTH LIABILITY",      value: fmtUSD(twelveTotalLiability), green: true },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded px-5 py-4">
              <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">
                {s.label}
              </div>
              <div className={`text-2xl font-bold ${s.green ? "text-green-600" : "text-gray-800"}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Detail table ─────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1565a8] text-white text-xs">
                <th className="px-4 py-2.5 text-left font-semibold">Notification Type</th>
                <th className="px-4 py-2.5 text-center font-semibold">% of Type</th>
                <th className="px-4 py-2.5 text-center font-semibold">Cost Per (¢)</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total to Send</th>
                <th className="px-4 py-2.5 text-right font-semibold">Total Liability</th>
                <th className="px-4 py-2.5 text-right font-semibold">12-Month to Send</th>
                <th className="px-4 py-2.5 text-right font-semibold">12-Month Liability</th>
              </tr>
            </thead>
            <tbody>
              {/* Mailers row */}
              <tr className="border-b border-gray-200 bg-white">
                <td className="px-4 py-3 font-semibold text-gray-800">Mailers</td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <select
                      value={mailerPct}
                      onChange={(e) => setMailerPct(Number(e.target.value))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:border-[#1565a8] w-20 text-center"
                    >
                      {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map((v) => (
                        <option key={v} value={v}>{v}%</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={mailerCost}
                    onChange={(e) => setMailerCost(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:border-[#1565a8] w-20 text-center"
                  >
                    {MAILER_COST_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}¢</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">
                  {fmt(totalToSendMailer)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-green-600">
                  {fmtUSD(liabilityMailer)}
                </td>
                <td className="px-4 py-3 text-right text-gray-800">
                  {fmt(twelveToSendMailer)}
                </td>
                <td className="px-4 py-3 text-right text-green-600">
                  {fmtUSD(twelveLiabilityMailer)}
                </td>
              </tr>

              {/* Email row */}
              <tr className="bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-800">Email</td>
                <td className="px-4 py-3 text-center text-gray-600 font-semibold">
                  {emailPct}%
                </td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={emailCost}
                    onChange={(e) => setEmailCost(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:border-[#1565a8] w-20 text-center"
                  >
                    {EMAIL_COST_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v}¢</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-800">
                  {fmt(totalToSendEmail)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-green-600">
                  {fmtUSD(liabilityEmail)}
                </td>
                <td className="px-4 py-3 text-right text-gray-800">
                  {fmt(twelveToSendEmail)}
                </td>
                <td className="px-4 py-3 text-right text-green-600">
                  {fmtUSD(twelveLiabilityEmail)}
                </td>
              </tr>

              {/* Totals row */}
              <tr className="bg-[#1565a8] text-white font-bold">
                <td className="px-4 py-3" colSpan={3}>Total</td>
                <td className="px-4 py-3 text-right">{fmt(data.totalNotifications)}</td>
                <td className="px-4 py-3 text-right">{fmtUSD(totalLiability)}</td>
                <td className="px-4 py-3 text-right">{fmt(data.twelveMonthNotifications)}</td>
                <td className="px-4 py-3 text-right">{fmtUSD(twelveTotalLiability)}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
