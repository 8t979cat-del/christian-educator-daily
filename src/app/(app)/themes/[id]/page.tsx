import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/container";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { addDays, formatDate, readableThrough, todayIn } from "@/lib/content/dates";
import { getLiveThemeDevotionals, getUserStates, listThemes } from "@/lib/content/queries";
import { getSiteTimeZone } from "@/lib/env";

export const metadata: Metadata = { title: "Weekly theme" };
export const dynamic = "force-dynamic";

export default async function ThemePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const theme = (await listThemes({ publishedOnly: true })).find((t) => t.id === id);
  if (!theme) notFound();

  const today = todayIn(getSiteTimeZone());
  const live = (await getLiveThemeDevotionals(id)).filter((d) => d.devotional_date <= readableThrough(today));
  const states = await getUserStates(live.map((d) => d.id));
  const days = [0, 1, 2, 3, 4].map((n) => {
    const date = addDays(theme.week_start, n);
    return { date, devotional: live.find((d) => d.devotional_date === date) ?? null };
  });

  return (
    <>
      <PageHeader title={theme.title} description={theme.summary || `Week of ${formatDate(theme.week_start)}`} />
      <ol className="grid gap-3">
        {days.map(({ date, devotional }, i) => (
          <li key={date}>
            {devotional ? (
              <Link href={`/devotional/${devotional.id}`} className="block rounded-card border border-line bg-surface p-5 hover:border-brand hover:bg-brand-soft/40">
                <p className="text-sm font-semibold text-brand">
                  Day {i + 1} · {formatDate(date, "short")}
                  {states.get(devotional.id)?.completed_at ? " · ✓ Completed" : ""}
                </p>
                <h2 className="mt-1 font-serif text-xl font-semibold">{devotional.title}</h2>
                <p className="text-muted">{devotional.scripture_reference}</p>
              </Link>
            ) : (
              <div className="rounded-card border border-dashed border-line-strong/50 p-5 text-muted">
                <p className="text-sm font-semibold">Day {i + 1} · {formatDate(date, "short")}</p>
                <p className="mt-1">{date > today ? `Coming ${formatDate(date, "short").split(",")[0]}` : "Not published"}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-6"><Link href="/themes" className="text-brand underline">← All weekly themes</Link></p>
    </>
  );
}
