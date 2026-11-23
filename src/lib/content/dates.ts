/** Calendar-date helpers. A devotional's date is a calendar day in the site's time zone, not an instant. */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Today's calendar date (YYYY-MM-DD) in the given time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export const isMonday = (isoDate: string): boolean => isValidIsoDate(isoDate) && isoWeekday(isoDate) === 1;

/** The Monday on or before the given date. */
export function mondayOf(isoDate: string): string {
  return addDays(isoDate, 1 - isoWeekday(isoDate));
}

export function formatDate(isoDate: string, style: "long" | "short" = "long"): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : "short",
    month: style === "long" ? "long" : "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Offset (ms) of a time zone from UTC at a given instant. */
function zoneOffset(timeZone: string, at: Date): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return asUtc - at.getTime();
}

/** Converts a wall-clock time ("2026-11-16T06:30") in a time zone to an ISO instant, or null if invalid. */
export function zonedTimeToIso(local: string, timeZone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match || !isValidIsoDate(match[1]!)) return null;
  const [h, m] = [Number(match[2]), Number(match[3])];
  if (h > 23 || m > 59) return null;
  const naive = Date.parse(`${local}:00Z`);
  let guess = naive - zoneOffset(timeZone, new Date(naive));
  guess = naive - zoneOffset(timeZone, new Date(guess)); // settle across a DST boundary
  return new Date(guess).toISOString();
}
