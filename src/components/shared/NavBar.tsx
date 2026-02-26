"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import type { UserRole } from "@/types";

interface NavBarProps {
  userName: string;
  role: UserRole;
}

const roleLabel: Record<UserRole, string> = {
  admin: "Admin",
  dealer: "Dealer",
  regional: "Regional",
  customer: "Customer",
};

export default function NavBar({ userName, role }: NavBarProps) {
  const isCustomer = role === "customer";
  const homeHref = isCustomer ? "/my-cars" : "/dashboard";

  return (
    <header className="w-full bg-[#1565a8] text-white">
      <div className="flex items-center justify-between px-4 py-2">
        {/* Logo */}
        <Link href={homeHref}>
          <span className="text-white font-black text-2xl italic tracking-tight select-none">
            ZAK<span className="font-light">TEK</span>
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1 text-sm">
          <span className="mr-2 text-white/90">Welcome, {userName}</span>

          {!isCustomer && (
            <>
              <span className="text-white/50 mx-1">|</span>
              <span className="text-white/80 text-xs">{roleLabel[role]}</span>
            </>
          )}

          {/* My Profile — all roles */}
          <span className="text-white/50 mx-1">|</span>
          <Link href="/profile" className="hover:underline flex items-center gap-1">
            <span>👤</span> My Profile
          </Link>

          {isCustomer ? (
            <>
              <span className="text-white/50 mx-1">|</span>
              <Link href="/my-cars" className="hover:underline flex items-center gap-1">
                <span>🚗</span> My Cars
              </Link>
            </>
          ) : (
            <>
              <span className="text-white/50 mx-1">|</span>
              <Link href="/dashboard" className="hover:underline flex items-center gap-1">
                <span>📊</span> Dashboard
              </Link>

              <span className="text-white/50 mx-1">|</span>
              <Link href="/dealerships" className="hover:underline flex items-center gap-1">
                <span>🏢</span> Dealerships
              </Link>

              <span className="text-white/50 mx-1">|</span>
              <Link href="/stats" className="hover:underline flex items-center gap-1">
                <span>$</span> Stats
              </Link>

              {role === "admin" && (
                <>
                  <span className="text-white/50 mx-1">|</span>
                  <Link href="/admin" className="hover:underline flex items-center gap-1">
                    <span>⚙️</span> Admin
                  </Link>
                </>
              )}
            </>
          )}

          <span className="text-white/50 mx-1">|</span>
          <Link href="/support" className="hover:underline flex items-center gap-1">
            <span>❓</span> Support
          </Link>

          <span className="text-white/50 mx-1">|</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="bg-[#0f4f8a] hover:bg-[#0a3d6f] border border-white/30 px-3 py-1 rounded text-sm transition-colors"
          >
            ➔ Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
