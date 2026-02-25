import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDashboardPath } from "@/lib/auth-helpers";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  redirect(getDashboardPath(session.user.role));
}
