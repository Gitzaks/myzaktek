import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  // Public routes — no auth needed
  const isPublic =
    pathname === "/login" ||
    pathname === "/activate" ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/activate");

  if (isPublic) {
    if (isLoggedIn) {
      const dest = role === "customer" ? "/my-cars" : "/dashboard";
      return NextResponse.redirect(new URL(dest, req.url));
    }
    return NextResponse.next();
  }

  // All other routes require auth
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Customer-only routes
  if (pathname.startsWith("/my-cars")) {
    if (role !== "customer") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // Block customers from staff routes
  if (role === "customer") {
    return NextResponse.redirect(new URL("/my-cars", req.url));
  }

  // Admin-only routes
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
};
