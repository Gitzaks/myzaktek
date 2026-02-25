interface DataNoteProps {
  lastUpdate?: string;
}

export default function DataNote({ lastUpdate }: DataNoteProps) {
  return (
    <div className="bg-orange-50 border border-orange-300 text-orange-800 text-sm px-4 py-3 flex items-start gap-2">
      <span className="text-orange-500 mt-0.5">⚠</span>
      <span>
        <strong>NOTE:</strong> There can be up to a 60-day delay between a customer&apos;s purchase
        date and when their contract is available for viewing on this site.
        {lastUpdate && <span className="ml-1 text-orange-600">(Last Update: {lastUpdate})</span>}
      </span>
    </div>
  );
}
