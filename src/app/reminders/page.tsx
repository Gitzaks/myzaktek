import { requireAuth } from "@/lib/auth-helpers";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";
import RemindersClient from "./RemindersClient";

export const metadata = { title: "Mailer List – ZAKTEK" };

export default async function RemindersPage() {
  const session = await requireAuth(["admin", "dealer", "regional"]);

  let logoUrl: string | null = null;
  if (session.user.dealerIds && session.user.dealerIds.length > 0) {
    await connectDB();
    const dealer = await Dealer.findById(session.user.dealerIds[0])
      .select("logoUrl")
      .lean() as { logoUrl?: string } | null;
    logoUrl = dealer?.logoUrl ?? null;
  }

  return <RemindersClient logoUrl={logoUrl} />;
}
