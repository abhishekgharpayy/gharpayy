const IST = "Asia/Kolkata";

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Calendar day in IST as YYYY-MM-DD for reliable same-day checks. */
export function calendarDayIST(iso: string | Date): string {
  const d = iso instanceof Date ? iso : parseInstant(iso);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** True when the instant falls on today's calendar date in IST. */
export function isTodayIST(iso: string | null | undefined): boolean {
  if (!iso?.trim()) return false;
  const day = calendarDayIST(iso);
  if (!day) return false;
  return day === calendarDayIST(new Date());
}
