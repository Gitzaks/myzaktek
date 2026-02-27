import { requireAuth } from "@/lib/auth-helpers";
import LiabilityClient from "./LiabilityClient";

export default async function LiabilityPage() {
  await requireAuth(["admin"]);
  return <LiabilityClient />;
}
