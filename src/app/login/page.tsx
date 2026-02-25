"use client";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password.");
    } else {
      // Middleware handles role-based redirect from /dashboard
      router.push("/dashboard");
    }
  }

  return (
    <div className="bg-white rounded shadow-md w-full max-w-sm p-8">
      <h1 className="text-xl font-bold text-[#1565a8] mb-6 text-center">Sign In</h1>

      {justRegistered && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded mb-4">
          Account created! Sign in below.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#1565a8]"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#1565a8] hover:bg-[#0f4f8a] disabled:opacity-60 text-white font-medium py-2 rounded transition-colors text-sm"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-4">
        New customer?{" "}
        <Link href="/activate" className="text-[#1565a8] hover:underline">
          Register here
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-[#1565a8] py-3 px-6">
        <span className="text-white font-black text-2xl italic tracking-tight">
          ZAK<span className="font-light">TEK</span>
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center">
        <Suspense fallback={<div className="bg-white rounded shadow-md w-full max-w-sm p-8" />}>
          <LoginForm />
        </Suspense>
      </div>

      <footer className="bg-gray-200 text-gray-600 text-xs text-center py-4">
        © 2006-{new Date().getFullYear()} ZAK Products II LLC
      </footer>
    </div>
  );
}
