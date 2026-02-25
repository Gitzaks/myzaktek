import { requireAuth } from "@/lib/auth-helpers";
import NavBar from "@/components/shared/NavBar";
import type { UserRole } from "@/types";

export default async function MyCarsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth(["customer"]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <NavBar userName={session.user.name} role={session.user.role as UserRole} />
      <main className="flex-1">{children}</main>
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
