import { requireAuth } from "@/lib/auth-helpers";
import DealershipsClient from "./DealershipsClient";
import { connectDB } from "@/lib/mongodb";
import ImportFile from "@/models/ImportFile";

export default async function DealershipsPage() {
  await requireAuth(["admin"]);
  await connectDB();

  const lastImport = await ImportFile.findOne({ status: "imported" }).sort({ updatedAt: -1 }).select("updatedAt").lean();
  const lastUpdate = lastImport
    ? new Date(lastImport.updatedAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
    : undefined;

  return <DealershipsClient lastUpdate={lastUpdate} />;
}
