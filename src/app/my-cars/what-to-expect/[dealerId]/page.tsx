import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/auth-helpers";
import { connectDB } from "@/lib/mongodb";
import Dealer from "@/models/Dealer";

/** Default "What to Expect" HTML rendered when the dealer has no custom content. */
function defaultContent(dealerName: string, phone: string, serviceUrl?: string) {
  return `
<p>When you come back to <strong>${dealerName}</strong> for your ZAKTEK reapplication
every six months, your vehicle will be treated with the following services:</p>

<h3>Exterior Cleaning</h3>
<ul>
  <li>Wheels/tires/wheel wells cleaned</li>
  <li>Bug &amp; tar spots removed</li>
  <li>Front grill/bumpers cleaned</li>
  <li>Car Wash</li>
</ul>

<h3>Interior Cleaning</h3>
<ul>
  <li>Carpet &amp; upholstery vacuumed</li>
  <li>Trunk vacuumed</li>
  <li>Vehicle interior cleaned</li>
  <li>Dash &amp; console cleaned</li>
  <li>Door panels cleaned</li>
</ul>

<h3>Exterior Detailing</h3>
<ul>
  <li>Wax (ZAKTEK RE-APPLICATION)</li>
  <li>Trim/Molding are cleaned and dressed</li>
  <li>Tires and wheel dressed</li>
  <li>Windows cleaned</li>
</ul>

<h3>Interior Detailing</h3>
<ul>
  <li>Dash &amp; Console Dressed</li>
  <li>Visor mirrors, rear view mirrors cleaned</li>
  <li>Windshield &amp; windows cleaned</li>
  <li>Floor Mats vacuumed/shampooed</li>
</ul>

<h2>How long will your biannual ZAKTEK re-application visit take?</h2>
<p>Your ZAKTEK reapplication will take an estimated 2-4 Hours.</p>

<h2>Do you need to make an appointment for your biannual ZAKTEK re-application visit?</h2>
<p>Yes, you should contact ${phone}${serviceUrl ? ` or <a href="${serviceUrl}" target="_blank" rel="noopener noreferrer" class="text-[#1565a8] hover:underline">${serviceUrl}</a>` : ""} to schedule an appointment for your ZAKTEK reapplication visit.</p>
`.trim();
}

export default async function WhatToExpectPage({
  params,
}: {
  params: Promise<{ dealerId: string }>;
}) {
  await requireAuth(["customer"]);
  const { dealerId } = await params;

  await connectDB();
  const dealer = await Dealer.findById(dealerId).lean();
  if (!dealer) notFound();

  const html = dealer.whatToExpect ?? defaultContent(dealer.name, dealer.phone, dealer.serviceUrl);

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      {/* Back link + dealer logo row */}
      <div className="flex items-start justify-between mb-4">
        <Link href="/my-cars" className="text-[#1565a8] text-sm hover:underline">
          ← Back
        </Link>
        {dealer.logoUrl && (
          <img src={dealer.logoUrl} alt={dealer.name} className="h-14 object-contain" />
        )}
        {!dealer.logoUrl && (
          <p className="font-bold text-lg text-gray-700">{dealer.name}</p>
        )}
      </div>

      {/* Title */}
      <h1 className="text-2xl italic font-bold text-gray-600 mb-4">
        What to expect on your bi-annual ZAKTEK reapplication visit?
      </h1>

      {/* Content */}
      <div
        className="prose prose-sm max-w-none text-gray-700 [&_h2]:text-base [&_h2]:italic [&_h2]:font-bold [&_h2]:text-gray-700 [&_h2]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-3 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mt-1 [&_li]:text-xs [&_p]:text-xs [&_p]:mt-1"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
