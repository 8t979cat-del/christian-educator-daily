import { z } from "zod";
import { addDays, isoWeekday } from "./dates";

export const REMINDER_DAYS = [
  { value: "weekdays", label: "Weekdays (Monday to Friday)" },
  { value: "daily", label: "Every day" },
] as const;

export const reminderSchema = z.object({
  reminderEnabled: z.boolean(),
  reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time."),
  reminderDays: z.enum(["weekdays", "daily"]),
});

export const DEFAULT_REMINDER_TIME = "06:30";

/** Postgres returns "06:30:00"; the form and calendar use "06:30". */
export const toHourMinute = (time: string | null | undefined): string =>
  /^\d{2}:\d{2}/.test(time ?? "") ? (time as string).slice(0, 5) : DEFAULT_REMINDER_TIME;

const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 octets, as RFC 5545 requires, without splitting a multi-byte character. */
function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = bytes.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + width > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * A recurring calendar event for the daily reminder. The time is "floating"
 * (no time zone), so it appears at that wall-clock time in whatever time zone
 * the teacher's calendar is in. They add it once; their own calendar app does the reminding.
 */
export function buildReminderIcs(opts: {
  time: string;
  days: "weekdays" | "daily";
  uid: string;
  startDate: string;
  url: string;
  now?: Date;
}): string {
  // For weekdays the first occurrence must itself be a weekday.
  let start = opts.startDate;
  if (opts.days === "weekdays") {
    const dow = isoWeekday(start);
    if (dow > 5) start = addDays(start, 8 - dow);
  }
  const [hh, mm] = opts.time.split(":") as [string, string];
  const dtstart = `${start.replace(/-/g, "")}T${hh}${mm}00`;
  const rule = opts.days === "weekdays" ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" : "FREQ=DAILY";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Christian Educator Daily//Daily reminder//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${stamp(opts.now ?? new Date())}`,
    `DTSTART:${dtstart}`,
    "DURATION:PT15M",
    `RRULE:${rule}`,
    `SUMMARY:${escapeText("Today's devotional")}`,
    `DESCRIPTION:${escapeText(`Take a few minutes with today's devotional.\n${opts.url}`)}`,
    `URL:${opts.url}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText("Today's devotional")}`,
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
