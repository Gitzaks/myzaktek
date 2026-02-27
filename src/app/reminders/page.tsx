import { auth } from "@/auth";
import { redirect } from "next/navigation";
import RemindersClient from "./RemindersClient";

export const metadata = { title: "Mailer List – ZAKTEK" };

export default async function RemindersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["admin", "dealer", "regional"].includes(session.user.role)) redirect("/");

  return <RemindersClient />;
}
