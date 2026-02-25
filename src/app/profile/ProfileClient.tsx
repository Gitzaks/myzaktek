"use client";
import { useState } from "react";

interface Props {
  initialFirstName: string;
  initialLastName: string;
}

export default function ProfileClient({ initialFirstName, initialLastName }: Props) {
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (password && password !== confirmPassword) {
      setMessage({ text: "Passwords do not match.", ok: false });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, password: password || undefined, confirmPassword: confirmPassword || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Update failed.", ok: false });
      } else {
        setMessage({ text: "Profile updated successfully.", ok: true });
        setPassword("");
        setConfirmPassword("");
      }
    } catch {
      setMessage({ text: "Network error. Please try again.", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto mt-12 px-4">
      <div className="bg-white border border-gray-200 rounded shadow-sm">
        {/* Header */}
        <div className="bg-[#1565a8] text-white px-6 py-4 rounded-t">
          <h1 className="text-lg font-semibold">User Profile Update</h1>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Update Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
            />
          </div>

          {message && (
            <p className={`text-sm ${message.ok ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-[#1565a8] hover:bg-[#0f4f8a] disabled:opacity-60 text-white font-semibold py-2 rounded text-sm transition-colors"
          >
            {saving ? "Saving…" : "Update My User Info"}
          </button>
        </form>
      </div>
    </div>
  );
}
