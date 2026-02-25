import { requireAuth } from "@/lib/auth-helpers";
import NavBar from "@/components/shared/NavBar";
import type { UserRole } from "@/types";

export default async function DealershipsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth(["admin"]);
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavBar userName={session.user.name} role={session.user.role as UserRole} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
