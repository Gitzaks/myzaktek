import { requireAuth } from "@/lib/auth-helpers";
import MyCarsClient from "../MyCarsClient";

export default async function AddCarPage() {
  await requireAuth(["customer"]);
  return (
    <div className="px-8 py-6">
      <MyCarsClient initialCars={[]} />
    </div>
  );
}
