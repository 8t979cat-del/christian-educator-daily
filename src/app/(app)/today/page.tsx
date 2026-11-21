import type { Metadata } from "next";
import Link from "next/link";
import { CompleteButton, PresentLink } from "@/components/content/devotional-actions";
import { RichTextView } from "@/components/content/rich-text-view";
import { PageHeader } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { requireAccess } from "@/lib/auth/session";
import { formatDate, isoWeekday, todayIn } from "@/lib/content/dates";
import { getLatestLiveOnOrBefore, getLiveDevotionalFor, getLiveThemeDevotionals, getThemeInfo, getUserState, getUserStates } from "@/lib/content/queries";
import { richTextToPlain } from "@/lib/content/richtext";
import { getSiteTimeZone } from "@/lib/env";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

const PREVIEW_CHARS = 220;
const preview = (text: string) => (text.length <= PREVIEW_CHARS ? text : `${text.slice(0, PREVIEW_CHARS).replace(/\s+\S*$/, "")}…`);
const DAY_LETTERS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export default async function TodayPage() {
  const { profile } = await requireAccess();
  const today = todayIn(getSiteTimeZone());
  const todays = await getLiveDevotionalFor(today);
  const d = todays ?? (await getLatestLiveOnOrBefore(today));
  const greeting = `Welcome, ${profile.first_name || "friend"}`;

  if (!d) {
    return (
      <>
        <PageHeader title={greeting} description={formatDate(today)} />
        <EmptyState
          icon="sun"
          title="No devotional is published yet"
          description="When an editor publishes a devotional it will appear here."
          action={<ButtonLink href="/archive">Browse the archive</ButtonLink>}
        />
      </>
    );
  }

  const [theme, state] = await Promise.all([getThemeInfo(d), getUserState(d.id)]);
  const week = theme ? await getLiveThemeDevotionals(theme.id) : [];
  const weekStates = await getUserStates(week.map((w) => w.id));
  const isToday = d.devotional_date === today;
  const reflection = preview(richTextToPlain(d.reflection));

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">{formatDate(today)}</p>
        <h1 className="mt-1 font-serif text-3xl font-normal md:text-4xl">{greeting}</h1>
      </header>

      <form action="/archive" method="get" role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">Search devotionals</label>
        <input
          id="q" name="q" type="search" placeholder="Search a word or a verse, like Galatians 6"
          className="min-h-11 w-full rounded-control border border-line-strong/60 bg-surface px-3 text-base"
        />
        <button type="submit" className="min-h-11 rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover">Search</button>
      </form>

      {!isToday ? (
        <p className="rounded-control bg-brand-soft p-3 text-sm">
          Nothing is published for today yet, so here is the latest devotional from {formatDate(d.devotional_date, "short")}.
        </p>
      ) : null}

      <section aria-labelledby="today-title" className="rounded-card border border-line bg-surface p-6 md:p-8">
        {theme ? (
          <p className="text-sm font-semibold text-brand">
            <Link href={`/themes/${theme.id}`} className="hover:underline">{theme.title}</Link>
            {theme.day ? ` · Day ${theme.day} of 5` : ""}
          </p>
        ) : null}
        <h2 id="today-title" className="mt-2 font-serif text-3xl font-normal leading-tight md:text-4xl">{d.title}</h2>
        {d.scripture_reference ? <p className="mt-2 text-lg font-semibold text-brand">{d.scripture_reference}</p> : null}
        {reflection ? <p className="mt-4 text-lg text-ink/80">{reflection}</p> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href={`/devotional/${d.id}`} size="lg">Read devotional</ButtonLink>
          <PresentLink href={`/devotional/${d.id}/present`} />
          <CompleteButton devotionalId={d.id} initial={Boolean(state?.completed_at)} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="prayer-h" className="rounded-card bg-brand-soft p-6">
          <h2 id="prayer-h" className="font-serif text-xl font-normal">Prayer prompt</h2>
          <RichTextView doc={d.prayer} className="mt-3" />
        </section>
        <section aria-labelledby="think-h" className="rounded-card border-2 border-brand bg-surface p-6">
          <h2 id="think-h" className="font-serif text-xl font-normal">Discussion question</h2>
          <RichTextView doc={d.discussion_question} className="mt-3" />
        </section>
      </div>

      {week.length > 1 ? (
        <nav aria-label="This week" className="rounded-card border border-line bg-surface p-4">
          <ol className="grid grid-cols-5 gap-2 text-center text-sm">
            {week.map((w) => {
              const dow = isoWeekday(w.devotional_date);
              const done = Boolean(weekStates.get(w.id)?.completed_at);
              return (
                <li key={w.id}>
                  <Link
                    href={`/devotional/${w.id}`}
                    aria-current={w.id === d.id ? "page" : undefined}
                    className={`block rounded-control px-1 py-2 ${w.id === d.id ? "bg-brand text-white" : "hover:bg-brand-soft"}`}
                  >
                    <span className="block font-semibold">{DAY_LETTERS[dow - 1] ?? "Day"}</span>
                    <span aria-hidden="true">{done ? "✓" : "·"}</span>
                    <span className="sr-only">{done ? ", completed" : ""}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      {!profile.reminder_enabled ? (
        <p className="text-center text-sm text-muted">
          Want a nudge each morning? <Link href="/settings" className="font-semibold text-brand underline">Set a daily reminder</Link>
        </p>
      ) : null}
    </div>
  );
}
