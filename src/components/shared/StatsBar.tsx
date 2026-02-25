interface StatsBarProps {
  remindersThisMonth: number;
  monthlySales: number;
  onRemindersClick?: () => void;
}

export default function StatsBar({ remindersThisMonth, monthlySales, onRemindersClick }: StatsBarProps) {
  return (
    <div className="flex items-stretch border-b border-gray-200 bg-white">
      {/* Reminders */}
      <div
        className={`flex items-center gap-4 px-8 py-4 border-r border-gray-200 ${onRemindersClick ? "cursor-pointer hover:bg-gray-50" : ""}`}
        onClick={onRemindersClick}
      >
        <div className="text-[#1565a8] text-3xl">📋</div>
        <div>
          <div className="text-3xl font-bold text-gray-800">
            {remindersThisMonth.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
            Reminders This Month
          </div>
          {onRemindersClick && (
            <div className="text-xs text-[#1565a8] hover:underline">Click to see list</div>
          )}
        </div>
      </div>

      {/* Monthly Sales */}
      <div className="flex items-center gap-4 px-8 py-4">
        <div className="text-[#1565a8] text-3xl">👤</div>
        <div>
          <div className="text-3xl font-bold text-gray-800">
            {monthlySales.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
            Monthly Sales
          </div>
          <div className="text-xs text-gray-400">New Customers This Month</div>
        </div>
      </div>
    </div>
  );
}
