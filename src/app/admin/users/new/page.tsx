"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";

type Role = "customer" | "dealer" | "admin";

interface DealerOption {
  _id: string;
  name: string;
  dealerCode: string;
}

export default function CreateUserPage() {
  const router = useRouter();

  const [role, setRole] = useState<Role>("dealer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [selectedDealerIds, setSelectedDealerIds] = useState<string[]>([]);
  const [dealerSearch, setDealerSearch] = useState("");

  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [loadingDealers, setLoadingDealers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load dealer list when Dealer role is selected
  useEffect(() => {
    if (role !== "dealer") return;
    setLoadingDealers(true);
    fetch("/api/dealers?limit=500")
      .then((r) => r.json())
      .then((data) => setDealers(data.dealers ?? []))
      .catch(() => setDealers([]))
      .finally(() => setLoadingDealers(false));
  }, [role]);

  const filteredDealers = useMemo(() => {
    const q = dealerSearch.trim().toLowerCase();
    if (!q) return dealers;
    return dealers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.dealerCode.toLowerCase().includes(q)
    );
  }, [dealers, dealerSearch]);

  function toggleDealer(id: string) {
    setSelectedDealerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (role === "dealer" && selectedDealerIds.length === 0) {
      setError("Please assign at least one dealership.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          role,
          dealerIds: selectedDealerIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create user.");
      } else {
        setSuccess(`User "${data.name}" created successfully.`);
        // Reset form
        setFirstName(""); setLastName(""); setEmail("");
        setPassword(""); setConfirm(""); setSelectedDealerIds([]);
        setRole("dealer");
      }
    } catch {
      setError("Network error — please try again.");
    }
    setSubmitting(false);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <a href="/admin" className="text-[#1565a8] text-sm hover:underline">← Back to Admin</a>
      </div>

      <div className="bg-[#1565a8] text-white font-bold italic text-lg px-4 py-3 rounded-t">
        Create a User
      </div>
      <div className="border border-t-0 border-gray-200 rounded-b p-6 bg-white">

        {/* Role selector */}
        <div className="mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">User Type</p>
          <div className="flex gap-4">
            {(["dealer", "admin", "customer"] as Role[]).map((r) => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => { setRole(r); setSelectedDealerIds([]); }}
                  className="accent-[#1565a8]"
                />
                <span className="text-sm text-gray-700 capitalize">{r}</span>
              </label>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                required
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>
          </div>

          {/* Dealer assignment — only shown for Dealer role */}
          {role === "dealer" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign Dealerships
                {selectedDealerIds.length > 0 && (
                  <span className="ml-2 text-xs text-[#1565a8] font-normal">
                    {selectedDealerIds.length} selected
                  </span>
                )}
              </label>
              <input
                type="text"
                placeholder="Search by name or code…"
                value={dealerSearch}
                onChange={(e) => setDealerSearch(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm mb-2 focus:outline-none focus:border-[#1565a8]"
              />
              {loadingDealers ? (
                <p className="text-sm text-gray-400">Loading dealerships…</p>
              ) : (
                <div className="border border-gray-200 rounded max-h-60 overflow-y-auto">
                  {filteredDealers.length === 0 ? (
                    <p className="text-sm text-gray-400 p-3">No dealers found.</p>
                  ) : (
                    filteredDealers.map((d) => (
                      <label
                        key={d._id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDealerIds.includes(d._id)}
                          onChange={() => toggleDealer(d._id)}
                          className="accent-[#1565a8]"
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-medium">{d.dealerCode}</span>
                          {" — "}
                          {d.name}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-700">{success}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="bg-[#1565a8] text-white font-medium px-6 py-2 rounded hover:bg-[#0f4f8a] disabled:opacity-50 text-sm"
          >
            {submitting ? "Creating…" : "Create User"}
          </button>
        </form>
      </div>
    </div>
  );
}
