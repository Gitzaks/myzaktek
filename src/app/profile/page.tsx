import { requireAuth } from "@/lib/auth-helpers";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const session = await requireAuth(["admin", "dealer", "regional", "customer"]);

  const nameParts = (session.user.name ?? "").trim().split(/\s+/);
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ");

  return <ProfileClient initialFirstName={firstName} initialLastName={lastName} />;
}
