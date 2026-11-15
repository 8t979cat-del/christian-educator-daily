import { NextResponse } from "next/server";
import { getAccessContext } from "@/lib/auth/session";
import { todayIn } from "@/lib/content/dates";
import { buildReminderIcs, toHourMinute } from "@/lib/content/reminders";
import { getPublicEnv, getSiteTimeZone } from "@/lib/env";

export const dynamic = "force-dynamic";

/** The signed-in teacher's daily reminder as a calendar file. Private to them: built from their own saved preference. */
export async function GET() {
  const ctx = await getAccessContext();
  if (!ctx) return NextResponse.json({ error: "Sign in to download your reminder." }, { status: 401 });
  const { profile, user } = ctx;
  if (!profile.reminder_enabled) {
    return NextResponse.json({ error: "Turn on your daily reminder in Settings first." }, { status: 409 });
  }

  const body = buildReminderIcs({
    time: toHourMinute(profile.reminder_time),
    days: profile.reminder_days === "daily" ? "daily" : "weekdays",
    uid: `daily-devotional-${user.id}@christian-educator-daily`,
    startDate: todayIn(getSiteTimeZone()),
    url: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/today`,
  });

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="daily-devotional-reminder.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
