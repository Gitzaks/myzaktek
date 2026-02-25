import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";

export default async function ServiceReminderPage({
  params,
}: {
  params: Promise<{ dealerId: string }>;
}) {
  await requireAuth(["customer"]);
  const { dealerId } = await params;

  await connectDB();
  const dealer = await Dealer.findById(dealerId).lean();
  if (!dealer) notFound();

  const pdfUrl = dealer.serviceReminderPdfUrl;

  return (
    <div className="max-w-4xl mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-4">
        <Link href="/my-cars" className="text-[#1565a8] text-sm hover:underline">
          ← Back to My Cars
        </Link>
        {dealer.logoUrl ? (
          <img src={dealer.logoUrl} alt={dealer.name} className="h-12 object-contain" />
        ) : (
          <p className="font-bold text-gray-700">{dealer.name}</p>
        )}
      </div>

      <h1 className="text-xl italic font-bold text-gray-500 mb-4">
        Service Reminder — {dealer.name}
      </h1>

      {pdfUrl ? (
        <>
          <p className="text-sm text-gray-600 mb-3">
            Your ZAKTEK service reminder mailer from {dealer.name} is shown below.
          </p>
          <div className="border border-gray-200 rounded overflow-hidden bg-gray-100">
            <iframe
              src={pdfUrl}
              className="w-full"
              style={{ height: "800px" }}
              title="Service Reminder PDF"
            />
          </div>
          <div className="mt-3">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1565a8] text-sm hover:underline"
            >
              Open PDF in new tab →
            </a>
          </div>
        </>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-6 text-sm text-yellow-800">
          <p className="font-semibold mb-1">Service Reminder Not Available</p>
          <p>
            {dealer.name} has not yet uploaded a service reminder mailer. Please contact
            your dealer directly at{" "}
            {dealer.serviceUrl ? (
              <a
                href={dealer.serviceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1565a8] hover:underline"
              >
                {dealer.name}
              </a>
            ) : (
              dealer.name
            )}{" "}
            or call {dealer.phone}.
          </p>
        </div>
      )}
    </div>
  );
}
