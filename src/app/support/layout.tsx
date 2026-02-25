import { requireAuth } from "@/lib/auth-helpers";
import NavBar from "@/components/shared/NavBar";
import type { UserRole } from "@/types";

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavBar userName={session.user.name} role={session.user.role as UserRole} />
      <main className="flex-1">{children}</main>
      <footer className="bg-white border-t border-gray-200 py-6 px-8">
        <div className="max-w-7xl mx-auto flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-1">About ZAK Products</p>
            <p className="text-xs text-gray-500 max-w-lg">
              ZAK Products partners exclusively with franchised car dealerships providing them with
              industry leading professionally formulated fluid maintenance chemical products.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              © 2006-{new Date().getFullYear()} ZAK Products II LLC
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black italic text-gray-700">
              ZAK<span className="font-light">.</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
