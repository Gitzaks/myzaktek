"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ActivatePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
      } else {
        router.push("/login?registered=1");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Public header */}
      <header className="bg-[#1565a8] py-3 px-6 flex items-center justify-between">
        <Link href="/activate">
          <span className="text-white font-black text-2xl italic tracking-tight select-none">
            ZAK<span className="font-light">TEK</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-white">
          <Link href="/activate" className="hover:underline px-2">Activate</Link>
          <span className="text-white/50">|</span>
          <Link href="/support" className="hover:underline px-2">Support</Link>
          <span className="text-white/50">|</span>
          <Link href="/login" className="hover:underline px-2">Log In</Link>
        </nav>
      </header>

      {/* Card */}
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="bg-white rounded shadow-md w-full max-w-sm p-8">
          {/* Icon + title */}
          <div className="flex flex-col items-center mb-6">
            <span className="text-4xl mb-2">📋</span>
            <h1 className="text-xl italic text-gray-500 font-medium">Register as a New User</h1>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="enter first name"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="enter last name"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@gmail.com"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <p className="text-xs text-gray-500 mb-1">Password must be 8 characters or longer</p>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retype Password</label>
              <input
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1565a8] hover:bg-[#0f4f8a] disabled:opacity-60 text-white font-medium py-2 rounded transition-colors text-sm"
            >
              {loading ? "Registering…" : "Register"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{" "}
            <Link href="/login" className="text-[#1565a8] hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>

      {/* Dark footer */}
      <footer className="bg-[#2d3748] text-white py-8 px-8">
        <div className="max-w-7xl mx-auto flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold mb-1">About ZAK Products</p>
            <p className="text-xs text-white/70 max-w-lg">
              ZAK Products partners exclusively with franchised car dealerships providing them with
              industry leading professionally formulated fluid maintenance chemical products.
            </p>
            <p className="text-xs text-white/50 mt-2">
              © 2006-{new Date().getFullYear()} ZAK Products II LLC
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black italic text-white">
              ZAK<span className="font-light">.</span>
            </span>
            <p className="text-xs text-white/70 mt-1">
              Are you a dealership?{" "}
              <a href="/contact" className="text-[#63b3ed] hover:underline">
                Click here
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
