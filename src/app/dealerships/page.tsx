import { requireAuth } from "@/lib/auth-helpers";
import DealershipsClient from "./DealershipsClient";

export default async function DealershipsPage() {
  await requireAuth(["admin"]);
  return <DealershipsClient />;
}
