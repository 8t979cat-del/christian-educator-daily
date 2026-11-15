import { describe, expect, it } from "vitest";
import { buildReminderIcs, reminderSchema, toHourMinute } from "@/lib/content/reminders";
import { searchTarget } from "@/lib/content/scripture";

const base = { time: "06:30", days: "weekdays" as const, uid: "u1@ced", url: "https://example.org/today", now: new Date("2026-11-14T12:00:00Z") };

describe("buildReminderIcs", () => {
  it("builds a floating-time weekly event with an alarm and CRLF line ends", () => {
    const ics = buildReminderIcs({ ...base, startDate: "2026-11-16" }); // a Monday
    expect(ics).toContain("DTSTART:20261116T063000\r\n");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:PT0M");
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("moves a weekend start date to Monday for weekday reminders", () => {
    expect(buildReminderIcs({ ...base, startDate: "2026-11-14" })).toContain("DTSTART:20261116T"); // Saturday
    expect(buildReminderIcs({ ...base, startDate: "2026-11-15" })).toContain("DTSTART:20261116T"); // Sunday
  });

  it("keeps the start date for daily reminders", () => {
    const ics = buildReminderIcs({ ...base, days: "daily", startDate: "2026-11-14" });
    expect(ics).toContain("DTSTART:20261114T063000");
    expect(ics).toContain("RRULE:FREQ=DAILY");
  });

  it("folds lines longer than 75 octets and escapes text", () => {
    const ics = buildReminderIcs({ ...base, startDate: "2026-11-16", url: `https://example.org/${"a".repeat(120)}` });
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain("\\n"); // the description newline is escaped, not literal
  });
});

describe("reminderSchema", () => {
  it("accepts valid values and rejects bad times and day patterns", () => {
    expect(reminderSchema.safeParse({ reminderEnabled: true, reminderTime: "06:30", reminderDays: "daily" }).success).toBe(true);
    expect(reminderSchema.safeParse({ reminderEnabled: true, reminderTime: "25:00", reminderDays: "daily" }).success).toBe(false);
    expect(reminderSchema.safeParse({ reminderEnabled: true, reminderTime: "06:30", reminderDays: "monthly" }).success).toBe(false);
  });
  it("trims database times like 06:30:00", () => {
    expect(toHourMinute("06:30:00")).toBe("06:30");
  });
});

describe("searchTarget", () => {
  it("treats a chapter reference as an exact book and chapter", () => {
    expect(searchTarget("Galatians 6")).toEqual({ kind: "reference", book: "Galatians", chapter: 6 });
    expect(searchTarget("  1 John 3:16 ")).toMatchObject({ kind: "reference", book: "1 John", chapter: 3 });
  });
  it("treats words, and a bare book name, as keyword search", () => {
    expect(searchTarget("patience")).toEqual({ kind: "text", text: "patience" });
    expect(searchTarget("John")).toEqual({ kind: "text", text: "John" });
  });
});
