"use client";
import { useState } from "react";

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

const WARRANTY_BLURB = (
  <p className="text-xs text-gray-600 bg-gray-100 border border-gray-300 rounded p-3 mb-3 leading-relaxed">
    ZAK Products II, LLC (ZAKTEK) hereby warrants to the Warranty Holder that any portion of the
    vehicle treated with the ZAKTEK Premium Coating/ZAKTEK Interior will not sustain damage as
    described in this warranty. ZAKTEK re-applications must be performed every 6 months during the
    warranty period at the ORIGINAL PURCHASING DEALERSHIP ONLY. Product warranty is based upon the
    installation and performance of the ZAKTEK Premium Coating and is non-cancellable,
    non-transferable and non-refundable.
  </p>
);

const FAQS: FaqItem[] = [
  {
    question: "How can I cancel my ZAKTEK warranty?",
    answer: (
      <>
        {WARRANTY_BLURB}
        <p>
          ZAKTEK is a non-cancelable product warranty as stated on the contract at the time of
          purchase. Please contact your dealer directly with any questions regarding cancellations
          or refunds.
        </p>
      </>
    ),
  },
  {
    question: "I bought a car and paid for a warranty. How do I know ZAKTEK was applied?",
    answer: (
      <p>
        Cars are typically treated as they arrive at the dealership to protect the vehicle while it
        is on the lot. There are cases when the dealership will apply ZAKTEK to the vehicle at the
        time of sale or within a short period after the sale.
      </p>
    ),
  },
  {
    question: "Is there another dealer I can visit near to where I live?",
    answer: (
      <>
        {WARRANTY_BLURB}
        <p>ZAKTEK re-applications must be performed at the purchasing dealership.</p>
      </>
    ),
  },
  {
    question: "My vehicle has a paint problem. How do I file a claim?",
    answer: (
      <p>
        All ZAKTEK claims are processed through the purchasing dealership, please contact the
        dealership to setup an appointment to have your claim processed. If you are not able to
        return to your purchasing dealership please contact the ZAKTEK warranty administrator at{" "}
        <strong>1-800-747-4400</strong>.
      </p>
    ),
  },
  {
    question: "I can't find my vehicle using my VIN on the website",
    answer: (
      <p>
        It can take up to 60 days for the vehicle information to be available to view. This in no
        way affects your warranty. Your initial re-application is not due for six months from your
        purchase date. If it has been over 60 days and your vehicle does not appear on the website
        please submit a comment and we will investigate and get back with you.
      </p>
    ),
  },
  {
    question: "I didn't get my postcard/email reminder.",
    answer: (
      <>
        <p className="mb-3">
          Reminders are sent out USPS the month before your re-application is due. The best way to
          ensure you receive your mailer each month is to add your email address to your account.
          We do not share your information with anyone, we only use it to send out your reminders
          every six months.
        </p>
        <p>
          You do not need the physical reminder to have your re-application performed, simply print
          off the page from the ZAKTEK website showing your re-application schedule and note this
          when making an appointment.
        </p>
      </>
    ),
  },
  {
    question: "What if I missed my ZAKTEK reapplication?",
    answer: (
      <p>
        Don&apos;t panic! You have a thirty day grace period to get your ZAKTEK reapplication. If
        you are past your grace period you are still eligible to receive your remaining ZAKTEK
        reapplications. However, your warranty will no longer be valid.
      </p>
    ),
  },
];

function FaqCard({ question, answer }: FaqItem) {
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);

  return (
    <div className="border border-gray-200 rounded overflow-hidden mb-4">
      <div className="bg-[#1565a8] px-5 py-3">
        <h2 className="text-white font-bold italic text-sm">{question}</h2>
      </div>
      <div className="bg-white px-5 py-4 text-sm text-gray-700 leading-relaxed space-y-2">
        {answer}
        <div className="flex items-center gap-2 pt-2">
          <span className="text-gray-600">Does this answer your question?</span>
          {answered === null ? (
            <>
              <button
                onClick={() => setAnswered("yes")}
                className="bg-[#1565a8] hover:bg-[#0f4f8a] text-white text-xs font-semibold px-4 py-1 rounded transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => setAnswered("no")}
                className="bg-[#1565a8] hover:bg-[#0f4f8a] text-white text-xs font-semibold px-4 py-1 rounded transition-colors"
              >
                No
              </button>
            </>
          ) : answered === "yes" ? (
            <span className="text-green-600 text-xs font-semibold">Thanks for the feedback!</span>
          ) : (
            <span className="text-sm text-gray-600">
              Please call us at <strong>1-800-747-4400</strong> for further assistance.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupportClient() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {FAQS.map((faq) => (
        <FaqCard key={faq.question} question={faq.question} answer={faq.answer} />
      ))}
    </div>
  );
}
