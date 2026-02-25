import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types";

export async function requireAuth(allowedRoles?: UserRole[]) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    redirect("/dashboard");
  }

  return session;
}

export async function getSession() {
  return auth();
}

export function getDashboardPath(role: UserRole): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "dealer":
      return "/dealer";
    case "regional":
      return "/regional";
    case "customer":
    default:
      return "/customer";
  }
}
