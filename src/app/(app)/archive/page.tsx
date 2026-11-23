import type { Metadata } from "next";
import { Pagination } from "@/components/content/pagination";
import { ResultList } from "@/components/content/result-list";
import { PageHeader } from "@/components/layout/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/form";
import { requireAccess } from "@/lib/auth/session";
import { todayIn } from "@/lib/content/dates";
import { CATEGORIES, GRADE_BANDS } from "@/lib/content/options";
import { readSearchParams } from "@/lib/content/params";
import { facultyIds, getBookmarkedHits, getUserStates, listThemes, searchDevotionals } from "@/lib/content/queries";
import { searchTarget } from "@/lib/content/scripture";
import Link from "next/link";
import { NoticesSlot } from "@/components/billing/notices-slot";
import { UpgradeNotice } from "@/components/billing/upgrade-notice";
import { canUse, getEntitlements, getLockedBookmarkCount, getLockedTeasers } from "@/lib/billing/queries";
import { getSiteTimeZone } from "@/lib/env";

export const metadata: Metadata = { title: "Archive" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export default async function ArchivePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess();
  const sp = searchParams;
  const f = readSearchParams(await sp);
  const today = todayIn(getSiteTimeZone());
  // Readers see published devotionals up to today, never future ones.
  const through = f.to && f.to < today ? f.to : today;

  const raw = await sp;
  const saved = (Array.isArray(raw.view) ? raw.view[0] : raw.view) === "saved";
  // "Galatians 6" matches that chapter exactly; anything else is a keyword search.
  const target = f.query ? searchTarget(f.query) : null;
  const [{ hits, total }, themes] = await Promise.all([
    saved ? getBookmarkedHits(f.page, PAGE_SIZE) : searchDevotionals({
      query: target?.kind === "text" ? target.text : undefined,
      book: target?.kind === "reference" ? target.book : undefined,
      chapter: target?.kind === "reference" ? target.chapter : undefined,
      category: f.category, grade: f.grade, theme: f.theme, from: f.from, through,
      onlyLive: true, page: f.page, pageSize: PAGE_SIZE,
    }),
    listThemes(),
  ]);
  const filtered = Boolean(f.query || f.category || f.grade || f.theme || f.from || f.to);
  const [states, faculty] = await Promise.all([getUserStates(hits.map((h) => h.id)), facultyIds(hits.map((h) => h.id))]);
  // Display only: the database already ignores filters and hides content the plan does not include.
  const [advanced, entitlements] = await Promise.all([canUse("archive_advanced_search"), getEntitlements()]);
  const archiveDays = entitlements.features.devotional_archive_days?.limit ?? null;
  const [teasers, lockedSaved] = await Promise.all([
    !saved && !filtered && archiveDays !== null ? getLockedTeasers(5) : Promise.resolve([]),
    saved ? getLockedBookmarkCount() : Promise.resolve(0),
  ]);

  return (
    <>
      <PageHeader title="Archive" description="Search every published devotional by words, Scripture reference, category, grade level or date." />
      <NoticesSlot />

      <nav aria-label="Archive views" className="mb-6 flex gap-2">
        {[
          { label: "All devotionals", href: "/archive", on: !saved },
          { label: "Saved", href: "/archive?view=saved", on: saved },
          { label: "Weekly themes", href: "/themes", on: false },
        ].map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={tab.on ? "page" : undefined}
            className={`min-h-11 content-center rounded-control px-4 font-semibold ${tab.on ? "bg-brand text-white" : "border border-line-strong/50 bg-surface hover:bg-brand-soft"}`}>
            {tab.label}
          </Link>
        ))}
      </nav>

      {saved ? null : <form method="get" role="search" className="mb-8 grid gap-4 rounded-card border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-4">
          <TextField label="Search" name="q" defaultValue={f.query} placeholder="A word, a title, or a reference like Galatians 6" />
        </div>
        {advanced ? null : (
          <div className="sm:col-span-2 lg:col-span-4">
            <UpgradeNotice title="Filters by category, grade, theme and date are part of Educator Plus" feature="archive_advanced_search">
              Searching by words or a Scripture reference is always free.
            </UpgradeNotice>
          </div>
        )}
        <SelectField label="Category" disabled={!advanced} name="category" defaultValue={f.category ?? ""} options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))]} />
        <SelectField label="Grade level" disabled={!advanced} name="grade" defaultValue={f.grade ?? ""} options={[{ value: "", label: "All grade levels" }, ...GRADE_BANDS]} />
        <SelectField label="Weekly theme" disabled={!advanced} name="theme" defaultValue={f.theme ?? ""} options={[{ value: "", label: "All themes" }, ...themes.map((t) => ({ value: t.id, label: t.title }))]} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="From" disabled={!advanced} name="from" type="date" defaultValue={f.from ?? ""} max={today} />
          <TextField label="To" disabled={!advanced} name="to" type="date" defaultValue={f.to ?? ""} max={today} />
        </div>
        <div className="flex gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Search</Button>
          {filtered ? <ButtonLink href="/archive" variant="ghost">Clear filters</ButtonLink> : null}
        </div>
      </form>}

      {hits.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={saved ? "Nothing saved yet" : filtered ? "No devotionals match your search" : "The archive is empty"}
          description={saved ? "Use “Save for later” on a devotional and it will be listed here." : filtered ? "Try fewer words, a different category, or a wider date range." : "Published devotionals will be listed here, newest first."}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {total} {total === 1 ? "devotional" : "devotionals"}{f.query ? ` for “${f.query}”` : ""}
          </p>
          <ResultList hits={hits} hrefFor={(id) => `/devotional/${id}`} states={states} faculty={faculty} />
          {teasers.length > 0 ? (
            <section aria-labelledby="older" className="mt-10">
              <h2 id="older" className="font-serif text-xl font-semibold">Older devotionals</h2>
              <p className="mt-1 text-sm text-muted">The free plan includes the last {archiveDays} days. These are part of the full archive in Educator Plus.</p>
              <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface">
                {teasers.map((t) => (
                  <li key={t.id}><Link href={`/devotional/${t.id}`} className="flex flex-wrap justify-between gap-2 p-4 hover:bg-brand-soft"><span className="font-medium">{t.title}</span><span className="text-sm text-muted">{t.scripture_reference} · {t.devotional_date}</span></Link></li>
                ))}
              </ul>
            </section>
          ) : null}
          {saved && lockedSaved > 0 ? <UpgradeNotice className="mt-6" title={`${lockedSaved} saved ${lockedSaved === 1 ? "devotional is" : "devotionals are"} outside your current plan`}>They are still saved, and return when your plan includes them.</UpgradeNotice> : null}
          <Pagination
            basePath="/archive"
            params={{ view: saved ? "saved" : undefined, q: f.query, category: f.category, grade: f.grade, theme: f.theme, from: f.from, to: f.to }}
            page={f.page}
            pageSize={PAGE_SIZE}
            total={total}
          />
        </>
      )}
    </>
  );
}
