import { requireAuth } from "@/lib/auth-helpers";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";
import User from "@/models/User";
import { notFound } from "next/navigation";
import DealerEditClient from "./DealerEditClient";

export default async function DealerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAuth(["admin"]);
  await connectDB();

  const { id } = await params;

  const dealer = await Dealer.findById(id).lean();
  if (!dealer) notFound();

  const users = await User.find({ dealerIds: dealer._id })
    .select("name email role active")
    .sort({ name: 1 })
    .lean();

  return (
    <DealerEditClient
      dealer={JSON.parse(JSON.stringify(dealer))}
      users={JSON.parse(JSON.stringify(users))}
    />
  );
}
