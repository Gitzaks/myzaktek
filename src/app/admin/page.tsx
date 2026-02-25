import { requireAuth } from "@/lib/auth-helpers";
import AdminClient from "./AdminClient";

export default async function AdminPage() {
  await requireAuth(["admin"]);
  return <AdminClient />;
}
