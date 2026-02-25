"use client";
import Link from "next/link";
import { useState } from "react";
import { fmtFullDate } from "@/lib/schedule";

interface DealerInfo {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  serviceUrl?: string;
  logoUrl?: string;
  serviceReminderPdfUrl?: string;
  fullWarrantyPdfUrl?: string;
}

interface CarRow {
  vehicleId: string | null;
  contractId: string | null;
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  dealerId: string;
  plan: string | null;
  status: string | null;
  beginsAt: string | null;
  endsAt: string | null;
  agreementId: string | null;
  planCode: string | null;
  maxMileage: number | null;
  beginMileage: number | null;
  deductible: number;
  schedule: string[];
}

interface UserInfo {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
}

interface Props {
  user: UserInfo;
  cars: CarRow[];
  dealerMap: Record<string, DealerInfo>;
}

function fmt(d: string | null) {
  if (!d) return "—";
  return fmtFullDate(new Date(d));
}

function fmtDate(d: string) {
  return fmtFullDate(new Date(d));
}

export default function MyCarsDashboard({ user, cars, dealerMap }: Props) {
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  async function handleRemove(vehicleId: string | null, contractId: string | null) {
    const id = vehicleId ?? contractId;
    if (!id) return;
    await fetch("/api/my-cars/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, contractId }),
    });
    setRemovedIds((prev) => new Set([...prev, id]));
  }

  const visibleCars = cars.filter(
    (c) => !removedIds.has(c.vehicleId ?? c.contractId ?? "")
  );

  return (
    <div className="p-4">
      {/* Top row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Account Info */}
        <div className="bg-white border border-gray-200 rounded flex overflow-hidden">
          <div className="bg-gray-100 flex flex-col items-center justify-center px-4 py-3 min-w-[110px]">
            <span className="text-3xl">🪪</span>
            <p className="text-xs font-bold text-center text-gray-600 mt-1 leading-tight">
              YOUR ACCOUNT<br />INFORMATION
            </p>
          </div>
          <div className="p-4 text-sm">
            <p className="font-semibold text-gray-800">{user.name}</p>
            {user.address && <p className="text-gray-600">{user.address}</p>}
            {(user.city || user.state || user.zip) && (
              <p className="text-gray-600">
                {user.city}{user.city && user.state ? "," : ""} {user.state} {user.zip}
              </p>
            )}
            {!user.address && !user.city && (
              <p className="text-gray-400 italic text-xs">No address on file</p>
            )}
          </div>
        </div>

        {/* Add New Car */}
        <div className="bg-white border border-gray-200 rounded flex items-center justify-center py-4">
          <Link href="/my-cars/add" className="text-[#5cb85c] text-center hover:opacity-80">
            <div className="text-2xl font-bold leading-none">+ 🚗</div>
            <div className="text-base mt-1">Add New Car</div>
          </Link>
        </div>

        {/* Note */}
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
          <span className="font-bold text-red-600">NOTE: </span>
          <span className="text-gray-700">
            ZAKTEX Reapplications are available for your vehicle through your purchasing
            dealership.
          </span>
        </div>
      </div>

      {/* Car rows */}
      {visibleCars.map((car) => {
        const dealer = dealerMap[car.dealerId];
        const detailHref = car.contractId
          ? `/my-cars/contract/${car.contractId}`
          : car.vehicleId
          ? `/my-cars/contract/${car.vehicleId}`
          : "#";

        // Build schedule columns
        const dates = car.schedule.map((s) => fmtDate(s));
        const half = Math.ceil(dates.length / 2);
        const col1 = dates.slice(0, half);
        const col2 = dates.slice(half);

        return (
          <div
            key={car.vehicleId ?? car.contractId}
            className="grid grid-cols-3 gap-3 mb-4"
          >
            {/* Dealer card */}
            <div className="bg-white border border-gray-200 rounded p-4 flex flex-col">
              {dealer?.logoUrl ? (
                <img
                  src={dealer.logoUrl}
                  alt={dealer?.name}
                  className="h-16 object-contain mb-2"
                />
              ) : (
                <p className="font-bold text-xl text-gray-800 mb-2">
                  {dealer?.name ?? "—"}
                </p>
              )}

              {dealer?.serviceUrl ? (
                <a
                  href={dealer.serviceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1565a8] text-sm hover:underline mb-2"
                >
                  Visit Dealership Website
                </a>
              ) : (
                <span className="text-[#1565a8] text-sm mb-2">
                  Visit Dealership Website
                </span>
              )}

              {dealer && (
                <div className="text-xs text-gray-600 space-y-0.5 flex-1">
                  <p className="font-semibold uppercase">{dealer.name}</p>
                  <p>{dealer.phone}</p>
                  <p>{dealer.address}</p>
                  <p>
                    {dealer.city} {dealer.state}, {dealer.zip}
                  </p>
                </div>
              )}

              <Link href={`/my-cars/what-to-expect/${car.dealerId}`} className="mt-3">
                <button className="w-full bg-[#1565a8] hover:bg-[#0f4f8a] text-white text-xs font-medium py-2 px-3 rounded transition-colors">
                  What to expect when you visit
                </button>
              </Link>
            </div>

            {/* Vehicle & Plan Details */}
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="bg-[#dce8f3] flex items-center gap-2 px-4 py-2">
                <span className="text-lg">🚗</span>
                <span className="text-[#1565a8] font-bold text-sm">
                  VEHICLE & PLAN DETAILS
                </span>
              </div>
              <div className="px-4 py-3 text-sm space-y-1">
                {car.year && car.make && car.model ? (
                  <p className="font-bold text-gray-800">
                    {car.year} {car.make} {car.model}
                  </p>
                ) : (
                  <p className="font-bold text-gray-800">{car.vin}</p>
                )}
                <p>
                  <span className="font-semibold">Vin:</span>{" "}
                  <span className="font-mono text-xs">{car.vin || "—"}</span>
                </p>
                <p>
                  <span className="font-semibold">Plan:</span> {car.plan ?? "—"}
                </p>
                <p className="text-xs text-gray-600">
                  <span className="font-semibold">Begin:</span> {fmt(car.beginsAt)}{" "}
                  <span className="font-semibold ml-2">End:</span> {fmt(car.endsAt)}
                </p>
              </div>
              <div className="flex gap-0 border-t border-gray-200">
                <Link href={detailHref} className="flex-1">
                  <button className="w-full bg-[#1a3f6b] hover:bg-[#122d4f] text-white text-xs font-medium py-2 transition-colors">
                    View All Vehicle &amp; Plan Details
                  </button>
                </Link>
                <button
                  onClick={() => handleRemove(car.vehicleId, car.contractId)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-4 py-2 transition-colors"
                >
                  Remove Car
                </button>
              </div>
            </div>

            {/* Applications Schedule */}
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="bg-[#dce8f3] flex items-center gap-2 px-4 py-2">
                <span className="text-lg">📅</span>
                <span className="text-[#1565a8] font-bold text-sm">
                  APPLICATIONS SCHEDULE
                </span>
              </div>
              <div className="px-4 py-3">
                {dates.length === 0 ? (
                  <p className="text-sm text-gray-500">No schedule available.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 text-xs text-gray-700">
                    <div className="space-y-1">
                      {col1.map((d, i) => (
                        <p key={i}>{d}</p>
                      ))}
                    </div>
                    <div className="space-y-1">
                      {col2.map((d, i) => (
                        <p key={i}>{d}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {visibleCars.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No vehicles linked to your account.</p>
          <Link href="/my-cars/add" className="text-[#1565a8] hover:underline mt-2 inline-block">
            Add a car
          </Link>
        </div>
      )}
    </div>
  );
}
