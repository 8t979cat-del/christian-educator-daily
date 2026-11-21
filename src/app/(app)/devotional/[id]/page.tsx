import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookmarkButton, CompleteButton, PresentLink, PrintButton, ShareButton } from "@/components/content/devotional-actions";
import { AddToCollectionControl } from "@/components/billing/collection-forms";
import { LockedDevotional } from "@/components/billing/locked-devotional";
import { canUse, getEntitlements, getLockInfo } from "@/lib/billing/queries";
import { createClient } from "@/lib/supabase/server";
import { DevotionalView } from "@/components/content/devotional-view";
import { NotesEditor } from "@/components/content/notes-editor";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { formatDate, todayIn } from "@/lib/content/dates";
import { getDevotional, getNeighbors, getThemeInfo, getTranslation, getUserState } from "@/lib/content/queries";
import { getSiteTimeZone } from "@/lib/env";
import { devotionalCredits, recordUsage } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Devotional" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function DevotionalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireAccess();
  const { id } = await params;
  await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  const today = todayIn(getSiteTimeZone());
  // Row-level security returns only live devotionals to readers; drafts look like "not found".
  const d = await getDevotional(id);
  if (!d || !["published", "scheduled"].includes(d.status) || d.devotional_date > today) {
    // A devotional the person's plan does not include shows only its title and why; anything else is not found.
    const lock = d ? null : await getLockInfo(id);
    if (!lock || lock.devotional_date > today) notFound();
    const days = (await getEntitlements()).features.devotional_archive_days?.limit ?? null;
    return <LockedDevotional title={lock.title} date={lock.devotional_date} reference={lock.scripture_reference} reason={lock.reason} archiveDays={days} />;
  }

  const collections = (await canUse("collections"))
    ? (((await (await createClient()).from("user_collections").select("id, name").order("name")).data ?? []) as { id: string; name: string }[])
    : [];
  void recordUsage("devotional_view");
  const [credits, translation, theme, state, { prev, next }] = await Promise.all([
    devotionalCredits(id),
    getTranslation(d.translation_code),
    getThemeInfo(d),
    getUserState(id),
    getNeighbors(d.devotional_date, today),
  ]);

  return (
    <div className="grid gap-10">
      <DevotionalView
        devotional={d}
        translation={translation}
        theme={theme}
        actions={
          <div className="flex flex-wrap gap-2">
            <PresentLink href={`/devotional/${id}/present`} variant="primary" />
            <CompleteButton devotionalId={id} initial={Boolean(state?.completed_at)} />
            <BookmarkButton devotionalId={id} initial={Boolean(state?.bookmarked)} />
            <ShareButton path={`/devotional/${id}`} title={d.title} reference={d.scripture_reference} />
            <PrintButton />
          </div>
        }
      />
      {credits.length > 0 ? (
        <section aria-label="Credits" className="mx-auto w-full max-w-3xl text-sm text-muted print:hidden">
          <ul className="grid gap-1">
            {credits.map((c) => (
              <li key={`${c.contributor_id}-${c.role}`}>
                <span className="font-semibold text-ink">{c.role === "author" ? "Written by" : c.role === "reviewer" ? "Reviewed by" : "With contributions from"} {c.name}</span>
                {c.bio ? ` · ${c.bio}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mx-auto w-full max-w-3xl">
        <NotesEditor devotionalId={id} initial={state?.note ?? ""} />
        <div className="mt-6"><AddToCollectionControl devotionalId={id} collections={collections} /></div>
      </div>
      {/* Comments ("Reflect Together") are off for launch: they need moderation the pilot is not staffed for. The component and its database switch remain. */}
      <nav aria-label="Devotional navigation" className="mx-auto grid w-full max-w-3xl gap-3 print:hidden sm:grid-cols-2">
        {prev ? (
          <Link href={`/devotional/${prev.id}`} className="rounded-card border border-line bg-surface p-4 hover:border-brand">
            <span className="text-sm text-muted">← Previous · {formatDate(prev.devotional_date, "short")}</span>
            <span className="mt-1 block font-serif text-lg font-semibold">{prev.title}</span>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/devotional/${next.id}`} className="rounded-card border border-line bg-surface p-4 text-right hover:border-brand sm:col-start-2">
            <span className="text-sm text-muted">Next · {formatDate(next.devotional_date, "short")} →</span>
            <span className="mt-1 block font-serif text-lg font-semibold">{next.title}</span>
          </Link>
        ) : null}
      </nav>
      <p className="mx-auto w-full max-w-3xl text-center text-sm print:hidden">
        <Link href="/archive" className="text-brand underline">Browse the archive</Link>
        {theme ? <> · <Link href={`/themes/${theme.id}`} className="text-brand underline">This week: {theme.title}</Link></> : null}
      </p>
    </div>
  );
}
