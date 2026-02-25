import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types";

/**
 * Edge-safe auth config — no Node.js-only imports (no bcrypt, no mongoose).
 * Used by the middleware to read JWT tokens without touching the DB.
 */
export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: UserRole }).role;
        token.dealerIds = (user as { dealerIds?: string[] }).dealerIds ?? [];
        token.regionId = (user as { regionId?: string }).regionId;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.role = token.role as UserRole;
        session.user.dealerIds = (token.dealerIds as string[]) ?? [];
        session.user.regionId = token.regionId as string | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
};
