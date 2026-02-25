"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface CarRow {
  vehicleId: string | null;
  contractId: string | null;
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  dealerName: string;
  plan: string | null;
  status: string | null;
  beginsAt: string | null;
  endsAt: string | null;
  agreementId: string | null;
  warrantyExpiresAt: string | null;
}

interface SearchResult {
  contractId: string | null;
  vehicleId: string | null;
  vin: string;
  year: number | null;
  make: string | null;
  model: string | null;
  color: string | null;
  dealerName: string;
  plan: string | null;
  beginsAt: string | null;
  endsAt: string | null;
  agreementId: string | null;
  alreadyClaimed: boolean;
}

interface Props {
  initialCars: CarRow[];
}

export default function MyCarsClient({ initialCars }: Props) {
  const router = useRouter();
  const [cars, setCars] = useState<CarRow[]>(initialCars);
  const [lastName, setLastName] = useState("");
  const [vinSuffix, setVinSuffix] = useState("");
  const [searching, setSearching] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError("");
    setResults(null);
    setSearching(true);
    try {
      const res = await fetch("/api/my-cars/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastName, vinSuffix }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? "Search failed.");
      } else if (!data.result) {
        setResults([]);
      } else {
        setResults([data.result]);
      }
    } catch {
      setSearchError("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(result: SearchResult) {
    const key = result.vehicleId ?? result.contractId ?? "";
    setClaiming(key);
    try {
      const res = await fetch("/api/my-cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: result.vehicleId, contractId: result.contractId }),
      });
      if (res.ok) {
        router.push("/my-cars");
      }
    } catch {
      setSearchError("Failed to add car. Please try again.");
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="px-8 py-6">
      {/* Existing cars */}
      {cars.length > 0 && (
        <div className="mb-8">
          <p className="italic text-[#1565a8] text-lg font-semibold mb-2">My Cars</p>
          <table className="w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="bg-[#1565a8] text-white">
                <th className="text-left px-4 py-2 font-semibold">Year</th>
                <th className="text-left px-4 py-2 font-semibold">Make</th>
                <th className="text-left px-4 py-2 font-semibold">Model</th>
                <th className="text-left px-4 py-2 font-semibold">Plan</th>
                <th className="text-left px-4 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car) => (
                <tr
                  key={car.vehicleId ?? car.contractId}
                  className="border-b border-gray-200 hover:bg-gray-50"
                >
                  <td className="px-4 py-2">{car.year ?? "—"}</td>
                  <td className="px-4 py-2">{car.make ?? "—"}</td>
                  <td className="px-4 py-2">{car.model ?? car.vin}</td>
                  <td className="px-4 py-2">{car.plan ?? "—"}</td>
                  <td className="px-4 py-2 capitalize">{car.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add New Car */}
      <div className="text-center mb-6">
        <div className="text-[#5cb85c] text-3xl mb-1">+ 🚗</div>
        <h2 className="text-[#5cb85c] text-2xl">Add New Car</h2>
      </div>

      <form onSubmit={handleSearch} className="max-w-xl space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Last Name</label>
          <input
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="jeffery"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Last 8 digits of VIN</label>
          <input
            type="text"
            required
            value={vinSuffix}
            onChange={(e) => setVinSuffix(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="51113034"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1565a8]"
          />
        </div>

        {searchError && <p className="text-red-600 text-sm">{searchError}</p>}

        <button
          type="submit"
          disabled={searching}
          className="bg-[#1565a8] hover:bg-[#0f4f8a] disabled:opacity-60 text-white font-medium px-5 py-2 rounded text-sm transition-colors"
        >
          {searching ? "Searching…" : "Search for Car"}
        </button>
      </form>

      {/* Search results table */}
      {results !== null && (
        <div className="mt-6 max-w-xl">
          <p className="italic text-[#1565a8] text-base font-semibold mb-1">Cars</p>

          {results.length === 0 ? (
            <p className="text-sm text-gray-600">
              No vehicle found. Check your last name and VIN, or contact your dealer.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#1565a8] text-white">
                  <th className="text-left px-4 py-2 font-semibold w-24">Year</th>
                  <th className="text-left px-4 py-2 font-semibold w-32">Make</th>
                  <th className="text-left px-4 py-2 font-semibold">Model</th>
                  <th className="text-left px-4 py-2 font-semibold w-20">Action</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const key = r.vehicleId ?? r.contractId ?? r.vin;
                  return (
                    <tr key={key} className="border-b border-gray-200 bg-white">
                      <td className="px-4 py-2">{r.year ?? "—"}</td>
                      <td className="px-4 py-2">{r.make ?? "—"}</td>
                      <td className="px-4 py-2">{r.model ?? r.vin}</td>
                      <td className="px-4 py-2">
                        {r.alreadyClaimed ? (
                          <span className="text-green-600 text-xs">Added</span>
                        ) : (
                          <button
                            onClick={() => handleAdd(r)}
                            disabled={claiming === key}
                            className="text-[#1565a8] hover:underline disabled:opacity-50 text-sm"
                          >
                            {claiming === key ? "Adding…" : "Add"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
