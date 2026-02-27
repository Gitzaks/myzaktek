"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface LiabilityData {
  buckets: Record<string, number>;
  totalCustomers: number;
  totalNotifications: number;
  twelveMonthNotifications: number;
}

function fmt(n: number) { return Math.round(n).toLocaleString(); }
function fmtUSD(n: number) { return "$ " + Math.round(n).toLocaleString(); }

const MAILER_COST_OPTIONS = Array.from({ length: 61 }, (_, i) => i + 30); // 30–90
const EMAIL_COST_OPTIONS  = Array.from({ length: 46 }, (_, i) => i + 5);  //  5–50

export default function LiabilityClient() {
  const [data, setData]             = useState<LiabilityData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [mailerPct, setMailerPct]   = useState(60);
  const [mailerCost, setMailerCost] = useState(57);
  const [emailCost, setEmailCost]   = useState(12);

  useEffect(() => {
    fetch("/api/liability")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400 text-sm">
        Loading…
      </div>
    );
  }
  if (!data) return null;

  const emailPct = 100 - mailerPct;

  const bucketKeys = Object.keys(data.buckets).map(Number).sort((a, b) => b - a);

  const totalToSendMailer     = Math.round(data.totalNotifications * (mailerPct / 100));
  const totalToSendEmail      = data.totalNotifications - totalToSendMailer;
  const liabilityMailer       = (totalToSendMailer  * mailerCost) / 100;
  const liabilityEmail        = (totalToSendEmail   * emailCost)  / 100;
  const totalLiability        = liabilityMailer + liabilityEmail;

  const twelveToSendMailer    = Math.round(data.twelveMonthNotifications * (mailerPct / 100));
  const twelveToSendEmail     = data.twelveMonthNotifications - twelveToSendMailer;
  const twelveLiabilityMailer = (twelveToSendMailer * mailerCost) / 100;
  const twelveLiabilityEmail  = (twelveToSendEmail  * emailCost)  / 100;
  const twelveTotalLiability  = twelveLiabilityMailer + twelveLiabilityEmail;

  const SELECT = "border border-gray-400 rounded px-1 py-0.5 text-sm bg-white focus:outline-none focus:border-[#1565a8] text-center";

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      {/* ── Header box ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-300 rounded p-4 flex items-center justify-between mb-5">
        {/* Left: icon + label */}
        <div className="flex flex-col items-center gap-0.5 min-w-[90px]">
          <span className="text-3xl leading-none">📬</span>
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center leading-tight">
            Reminders<br />This Month
          </span>
        </div>

        {/* Center: page title */}
        <h1 className="text-2xl font-semibold text-gray-800 flex-1 text-center">
          Liability Calculator
        </h1>

        {/* Right: back link */}
        <Link
          href="/stats"
          className="text-2xl font-bold italic text-[#1565a8] hover:underline min-w-[220px] text-right"
        >
          Back to Sales Graph
        </Link>
      </div>

      {/* ── Summary sentence ────────────────────────────────────────────────── */}
      <p className="text-sm text-gray-700 mb-4">
        The Zaktek program has a total of{" "}
        <span className="font-bold">{fmt(data.totalCustomers)}</span>{" "}
        customers with 1 or more notifications due.
      </p>

      {/* ── Bucket table ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-300 rounded overflow-hidden mb-5">
        <table className="w-full text-center text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-700 border-b border-gray-300">
              {bucketKeys.map((k) => (
                <th key={k} className="py-2 px-3 font-bold border-r border-gray-300 last:border-r-0">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {bucketKeys.map((k) => (
                <td key={k} className="py-2.5 px-3 text-gray-800 font-semibold border-r border-gray-200 last:border-r-0">
                  {fmt(data.buckets[String(k)] ?? 0)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Stats line ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-300 rounded px-6 py-3 flex items-center justify-between mb-5 text-sm">
        <span>
          <span className="font-bold text-gray-600 uppercase tracking-wide text-xs">Total Notifications: </span>
          <span className="font-bold text-gray-900 text-base">{fmt(data.totalNotifications)}</span>
        </span>
        <span>
          <span className="font-bold text-gray-600 uppercase tracking-wide text-xs">Total Liability: </span>
          <span className="font-bold text-gray-900 text-base">{fmtUSD(totalLiability)}</span>
        </span>
        <span>
          <span className="font-bold text-gray-600 uppercase tracking-wide text-xs">12-Month Notifications: </span>
          <span className="font-bold text-gray-900 text-base">{fmt(data.twelveMonthNotifications)}</span>
        </span>
        <span>
          <span className="font-bold text-gray-600 uppercase tracking-wide text-xs">12-Month Liability: </span>
          <span className="font-bold text-gray-900 text-base">{fmtUSD(twelveTotalLiability)}</span>
        </span>
      </div>

      {/* ── Detail table ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-300 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300 text-xs text-gray-700 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-semibold border-r border-gray-300">Notification Type</th>
              <th className="px-4 py-2.5 text-center font-semibold border-r border-gray-300">% of Type</th>
              <th className="px-4 py-2.5 text-center font-semibold border-r border-gray-300">Cost Per</th>
              <th className="px-4 py-2.5 text-right font-semibold border-r border-gray-300">Total to Send</th>
              <th className="px-4 py-2.5 text-right font-semibold border-r border-gray-300">Total Liability</th>
              <th className="px-4 py-2.5 text-right font-semibold border-r border-gray-300">12-Month to Send</th>
              <th className="px-4 py-2.5 text-right font-semibold">12-Month Liability</th>
            </tr>
          </thead>
          <tbody>
            {/* Mailers */}
            <tr className="border-b border-gray-200">
              <td className="px-4 py-3 font-semibold text-gray-800 border-r border-gray-200">Mailers</td>
              <td className="px-4 py-3 text-center border-r border-gray-200">
                <select
                  value={mailerPct}
                  onChange={(e) => setMailerPct(Number(e.target.value))}
                  className={SELECT + " w-16"}
                >
                  {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-center border-r border-gray-200">
                <select
                  value={mailerCost}
                  onChange={(e) => setMailerCost(Number(e.target.value))}
                  className={SELECT + " w-16"}
                >
                  {MAILER_COST_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-right text-gray-800 border-r border-gray-200">{fmt(totalToSendMailer)}</td>
              <td className="px-4 py-3 text-right text-gray-800 border-r border-gray-200">{fmtUSD(liabilityMailer)}</td>
              <td className="px-4 py-3 text-right text-gray-800 border-r border-gray-200">{fmt(twelveToSendMailer)}</td>
              <td className="px-4 py-3 text-right text-gray-800">{fmtUSD(twelveLiabilityMailer)}</td>
            </tr>

            {/* Email */}
            <tr>
              <td className="px-4 py-3 font-semibold text-gray-800 border-r border-gray-200">Email</td>
              <td className="px-4 py-3 text-center text-gray-700 border-r border-gray-200">{emailPct}%</td>
              <td className="px-4 py-3 text-center border-r border-gray-200">
                <select
                  value={emailCost}
                  onChange={(e) => setEmailCost(Number(e.target.value))}
                  className={SELECT + " w-16"}
                >
                  {EMAIL_COST_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3 text-right text-gray-800 border-r border-gray-200">{fmt(totalToSendEmail)}</td>
              <td className="px-4 py-3 text-right text-gray-800 border-r border-gray-200">{fmtUSD(liabilityEmail)}</td>
              <td className="px-4 py-3 text-right text-gray-800 border-r border-gray-200">{fmt(twelveToSendEmail)}</td>
              <td className="px-4 py-3 text-right text-gray-800">{fmtUSD(twelveLiabilityEmail)}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  );
}
