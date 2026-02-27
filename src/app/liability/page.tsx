import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LiabilityClient from "./LiabilityClient";

export const metadata = { title: "Liability Calculator – ZAKTEK" };

export default async function LiabilityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["admin", "dealer", "regional"].includes(session.user.role)) redirect("/");

  return <LiabilityClient />;
}
