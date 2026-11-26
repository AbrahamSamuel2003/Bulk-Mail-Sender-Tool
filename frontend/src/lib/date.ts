const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function getTodayDateString(timeZone = "America/New_York"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
}

export function parseIsoDateToUtcMidnight(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Invalid ISO date string: ${dateStr}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDbDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return `${String(d).padStart(2, "0")} ${SHORT_MONTH_NAMES[m - 1]} ${y}`;
  }
  return dateStr;
}

export function stepIsoDate(dateStr: string, deltaDays: number): string {
  const dt = parseIsoDateToUtcMidnight(dateStr);
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return formatDbDate(dt);
}

export function getRelativeDayLabel(dateStr: string, todayIso: string): string {
  try {
    const target = parseIsoDateToUtcMidnight(dateStr).getTime();
    const today = parseIsoDateToUtcMidnight(todayIso).getTime();
    const diffDays = Math.round((today - target) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays === 2) return "2 days ago";
    if (diffDays === 3) return "3 days ago";
    if (diffDays > 3) return `${diffDays} days ago`;
    if (diffDays === -1) return "Tomorrow";
    return `In ${Math.abs(diffDays)} days`;
  } catch {
    return "";
  }
}

