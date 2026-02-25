/** Generate bi-annual (every 6 months) application dates for a contract. */
export function getApplicationSchedule(beginsAt: Date, endsAt: Date): Date[] {
  const dates: Date[] = [];
  const d = new Date(beginsAt);
  while (d <= endsAt) {
    dates.push(new Date(d));
    d.setMonth(d.getMonth() + 6);
  }
  return dates;
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function fmtFullDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
