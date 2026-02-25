"use client";
import { useState } from "react";
import Link from "next/link";
import { fmtMonthYear } from "@/lib/schedule";

interface DealerInfo {
  id: string;
  name: string;
  city: string;
  state: string;
  logoUrl?: string;
  serviceReminderPdfUrl?: string;
  fullWarrantyPdfUrl?: string;
}

interface ContractInfo {
  contractId: string;
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  agreementId: string | null;
  plan: string | null;
  planCode: string | null;
  beginsAt: string | null;
  endsAt: string | null;
  maxMileage: number | null;
  beginMileage: number | null;
  deductible: number;
  schedule: string[];
}

interface UserInfo {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  suiteApt: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
}

interface Props {
  user: UserInfo;
  contract: ContractInfo;
  dealer: DealerInfo;
}

function fmtLong(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ContractInfoClient({ user, contract, dealer }: Props) {
  const [form, setForm] = useState({ ...user });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const months =
    contract.beginsAt && contract.endsAt
      ? Math.round(
          (new Date(contract.endsAt).getTime() - new Date(contract.beginsAt).getTime()) /
            (1000 * 60 * 60 * 24 * 30.44)
        )
      : null;

  const dates = contract.schedule.map((s) => fmtMonthYear(new Date(s)));
  const half = Math.ceil(dates.length / 2);
  const col1 = dates.slice(0, half);
  const col2 = dates.slice(half);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          address: form.address,
          city: form.city,
          state: form.state,
          zip: form.zip,
          phone: form.phone,
          email: form.email,
        }),
      });
      setSaveMsg(res.ok ? "Saved!" : "Failed to save.");
    } catch {
      setSaveMsg("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <span className="text-4xl">📋</span>
        <h1 className="text-3xl italic text-gray-400 font-semibold">Contract Information</h1>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* LEFT: Editable profile form */}
        <form onSubmit={handleSave} className="space-y-3">
          {[
            { label: "First Name", key: "firstName" },
            { label: "Last Name", key: "lastName" },
            { label: "Address", key: "address" },
            { label: "Suite or Apt#", key: "suiteApt" },
            { label: "City", key: "city" },
            { label: "State", key: "state" },
            { label: "Zip Code", key: "zip" },
            { label: "Owner Phone", key: "phone" },
            { label: "Email", key: "email" },
          ].map(({ label, key }) => (
            <div key={key} className="flex items-center gap-4">
              <label className="text-sm text-gray-600 w-28 text-right shrink-0">
                {label}
              </label>
              <input
                type={key === "email" ? "email" : "text"}
                value={form[key as keyof typeof form] ?? ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [key]: e.target.value }))
                }
                placeholder={
                  key === "suiteApt" ? "enter suite or apartment #" : undefined
                }
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#1565a8] bg-gray-50"
              />
            </div>
          ))}

          <div className="flex items-center gap-4">
            <div className="w-28" />
            <button
              type="submit"
              disabled={saving}
              className="bg-[#1565a8] hover:bg-[#0f4f8a] disabled:opacity-60 text-white text-sm font-medium px-5 py-1.5 rounded transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saveMsg && (
              <span className={`text-sm ${saveMsg === "Saved!" ? "text-green-600" : "text-red-600"}`}>
                {saveMsg}
              </span>
            )}
          </div>
        </form>

        {/* RIGHT: Contract details */}
        <div className="space-y-4">
          {/* Dealer logo */}
          <div className="flex justify-end">
            {dealer.logoUrl ? (
              <img src={dealer.logoUrl} alt={dealer.name} className="h-14 object-contain" />
            ) : (
              <p className="font-bold text-lg text-gray-700">{dealer.name}</p>
            )}
          </div>

          {/* Vehicle & Plan Details card */}
          <div className="border border-gray-200 rounded overflow-hidden">
            <div className="bg-[#dce8f3] flex items-center gap-2 px-4 py-2">
              <span>🚗</span>
              <span className="text-[#1565a8] font-bold text-sm">
                VEHICLE &amp; PLAN DETAILS
              </span>
            </div>
            <div className="px-4 py-3 text-sm space-y-2">
              {/* Vehicle title */}
              <p className="font-semibold text-gray-800">
                {contract.year && contract.make && contract.model
                  ? `${contract.year} ${contract.make} ${contract.model} with VIN ${contract.vin}`
                  : contract.vin}
              </p>
              <p className="text-gray-600 text-xs">
                Purchased from {dealer.name} in {dealer.city}, {dealer.state}
                {contract.beginMileage != null
                  ? ` with the beginning mileage of ${contract.beginMileage}.`
                  : "."}
              </p>

              {months && (
                <p className="text-gray-700 text-xs">
                  This vehicle has the {months}-month coverage which was purchased on{" "}
                  {fmtLong(contract.beginsAt)} and is valid through{" "}
                  {fmtLong(contract.endsAt)}
                  {contract.maxMileage ? ` (or ${contract.maxMileage.toLocaleString()} miles).` : "."}
                </p>
              )}

              <ul className="text-xs text-gray-700 space-y-0.5 mt-2">
                {contract.agreementId && (
                  <li>
                    <span className="font-semibold">Agreement #:</span> {contract.agreementId}
                  </li>
                )}
                <li>
                  <span className="font-semibold">Begin Date:</span>{" "}
                  {fmtLong(contract.beginsAt)}
                </li>
                <li>
                  <span className="font-semibold">End Date:</span>{" "}
                  {fmtLong(contract.endsAt)}
                </li>
                {contract.planCode && (
                  <li>
                    <span className="font-semibold">Plan:</span> {contract.planCode}
                  </li>
                )}
                <li>
                  <span className="font-semibold">Coverage:</span> {contract.plan ?? "—"}
                </li>
                {months && (
                  <li>
                    <span className="font-semibold">Coverage Months:</span> {months}
                  </li>
                )}
                <li>
                  <span className="font-semibold">Coverage Miles:</span>{" "}
                  {contract.maxMileage != null ? "" : ""}
                </li>
                {contract.maxMileage != null && (
                  <li>
                    <span className="font-semibold">Expiration Mileage:</span>{" "}
                    {contract.maxMileage.toLocaleString()}
                  </li>
                )}
                <li>
                  <span className="font-semibold">Deductible:</span> $
                  {contract.deductible ?? 0}
                </li>
              </ul>

              {/* Full Warranty button */}
              {dealer.fullWarrantyPdfUrl ? (
                <a href={dealer.fullWarrantyPdfUrl} target="_blank" rel="noopener noreferrer">
                  <button className="w-full bg-[#1565a8] hover:bg-[#0f4f8a] text-white text-xs font-medium py-2 rounded mt-2 transition-colors">
                    Click to see Full Warranty
                  </button>
                </a>
              ) : (
                <button
                  disabled
                  className="w-full bg-[#1565a8] opacity-50 text-white text-xs font-medium py-2 rounded mt-2"
                >
                  Click to see Full Warranty
                </button>
              )}

              {/* Service Reminder link */}
              <p className="mt-1">
                <Link
                  href={`/my-cars/service-reminder/${dealer.id}`}
                  className="text-[#1565a8] text-xs hover:underline"
                >
                  Click to see Service Reminder
                </Link>
              </p>
            </div>
          </div>

          {/* Applications Schedule card */}
          <div className="border border-gray-200 rounded overflow-hidden">
            <div className="bg-[#dce8f3] flex items-center gap-2 px-4 py-2">
              <span>📅</span>
              <span className="text-[#1565a8] font-bold text-sm">
                APPLICATIONS SCHEDULE
              </span>
            </div>
            <div className="px-4 py-3">
              {dates.length > 0 && (
                <div className="grid grid-cols-2 gap-x-8 text-xs text-gray-700 mb-3">
                  <div className="space-y-0.5">
                    {col1.map((d, i) => <p key={i}>{d}</p>)}
                  </div>
                  <div className="space-y-0.5">
                    {col2.map((d, i) => <p key={i}>{d}</p>)}
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500 mt-2">
                You do not need the physical reminder to have your re-application performed,
                simply print off the page from the ZAKTEK website showing your re-application
                schedule and note this when making an appointment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
