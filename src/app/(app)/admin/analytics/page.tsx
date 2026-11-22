import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/content/admin-nav";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { REPORT_REASON_LABEL } from "@/lib/community/covenant";
import { platformMetrics, type Metrics } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "not enough data yet");

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-control border border-line p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl font-semibold">{value}</dd>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

/** Daily counts as plain bars with a table-equivalent label, so the numbers are readable without the picture. */
function Daily({ title, rows }: { title: string; rows: Array<{ day: string; n: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <Card>
      <Heading level={3} size={4}>{title}</Heading>
      <Text size="sm" muted>{total} in this period</Text>
      <div role="img" aria-label={`${title}: ${total} in total, highest day ${max}`} className="mt-3 flex h-24 items-end gap-px">
        {rows.map((r) => <div key={r.day} title={`${r.day}: ${r.n}`} className="min-w-px flex-1 bg-brand/70" style={{ height: `${Math.max(2, (r.n / max) * 100)}%` }} />)}
      </div>
    </Card>
  );
}

const List = ({ data, label }: { data: Record<string, number>; label?: (k: string) => string }) => {
  const entries = Object.entries(data);
  return entries.length === 0 ? <Text size="sm" muted>None in this period.</Text> : (
    <ul className="grid gap-1 text-sm">{entries.map(([k, v]) => <li key={k} className="flex justify-between gap-4"><span>{label ? label(k) : k.replaceAll("_", " ")}</span><strong>{v}</strong></li>)}</ul>
  );
};

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePlatformRole(["platform_admin"]);
  const sp = await searchParams;
  const days = RANGES.find((r) => String(r) === sp.days) ?? 30;
  const m: Metrics | null = await platformMetrics(days);

  return (
    <>
      <PageHeader title="Platform analytics" description="How the platform is used, as totals. There are no per-person figures here and nothing ranks or scores anyone." />
      <AdminNav current="/admin/analytics" />
      <Alert tone="info" className="mb-6">
        These are counts, not measures of anyone&apos;s faith or commitment. Private prayers and private notes are not counted. Readership and presentation counts are page opens, so a person who reopens a page counts again.
      </Alert>
      <nav aria-label="Period" className="mb-6 flex gap-2">
        {RANGES.map((r) => <Link key={r} href={`?days=${r}`} aria-current={r === days ? "page" : undefined} className={"inline-flex min-h-11 items-center rounded-control border px-4 text-sm font-semibold " + (r === days ? "border-brand bg-brand-soft text-brand" : "border-line-strong/60 hover:bg-brand-soft")}>Last {r} days</Link>)}
      </nav>
      {!m ? <EmptyState icon="alert" title="Analytics are not available" description="Only platform administrators can see this page, and the database must be reachable." /> : (
        <div className="grid gap-8">
          <section aria-label="Educators"><Heading level={2} size={3}>Educators</Heading>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <Stat label="Active today" value={m.active_educators.day} />
              <Stat label="Active in 7 days" value={m.active_educators.week} />
              <Stat label="Active in 30 days" value={m.active_educators.month} note="Signed in and used the app at least once." />
            </dl></section>
          <section aria-label="Reading and presenting" className="grid gap-3 md:grid-cols-2">
            <Daily title="Devotional readership (page opens)" rows={m.readership} />
            <Daily title="Classroom presentations (opens)" rows={m.presentations} />
          </section>
          <section aria-label="Community"><Heading level={2} size={3}>Community</Heading>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Card><Heading level={3} size={4}>Contributions by type</Heading><div className="mt-2"><List data={m.contributions.by_kind} /></div><Text size="sm" muted className="mt-2">Plus {m.contributions.replies} replies. Public and anonymous only.</Text></Card>
              <Card><Heading level={3} size={4}>Private groups</Heading><dl className="mt-2 grid gap-1 text-sm"><div className="flex justify-between"><dt>Active groups</dt><dd><strong>{m.groups.active}</strong></dd></div><div className="flex justify-between"><dt>Waiting for review</dt><dd><strong>{m.groups.pending}</strong></dd></div><div className="flex justify-between"><dt>Groups with activity</dt><dd><strong>{m.groups.with_activity}</strong></dd></div><div className="flex justify-between"><dt>Posts</dt><dd><strong>{m.groups.posts}</strong></dd></div><div className="flex justify-between"><dt>Comments</dt><dd><strong>{m.groups.comments}</strong></dd></div></dl></Card>
              <Card><Heading level={3} size={4}>Prayer</Heading><Stat label="“I prayed” acknowledgements" value={m.prayer_acknowledgements} note="A single total. Never broken down by person, prayer or popularity." /></Card>
            </div></section>
          <section aria-label="Subscriptions"><Heading level={2} size={3}>Subscriptions and schools</Heading>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Card><Heading level={3} size={4}>Active by plan</Heading><div className="mt-2"><List data={m.subscriptions.active_by_plan} /></div></Card>
              <Card><Heading level={3} size={4}>School subscriptions</Heading><div className="mt-2"><List data={m.schools.by_status} /></div><Text size="sm" muted className="mt-2">{m.schools.licensed_seats} licensed seats in use.</Text></Card>
              <Card><Heading level={3} size={4}>Conversion and retention</Heading><dl className="mt-2 grid gap-1 text-sm">
                <div className="flex justify-between"><dt>New subscriptions</dt><dd><strong>{m.subscriptions.started}</strong></dd></div>
                <div className="flex justify-between"><dt>Trials ended</dt><dd><strong>{m.subscriptions.trials_ended}</strong></dd></div>
                <div className="flex justify-between"><dt>Trial conversion</dt><dd><strong>{pct(m.subscriptions.trials_converted, m.subscriptions.trials_ended)}</strong></dd></div>
                <div className="flex justify-between"><dt>Kept after 30 days</dt><dd><strong>{pct(m.subscriptions.retention_kept, m.subscriptions.retention_cohort)}</strong></dd></div></dl>
                <Text size="sm" muted className="mt-2">Conversion: of trials that ended in this period, the share now paying. Retention: of subscriptions older than 30 days, the share still active.</Text></Card>
            </div></section>
          <section aria-label="Moderation"><Heading level={2} size={3}>Moderation</Heading>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Card><Heading level={3} size={4}>Reports by reason</Heading><div className="mt-2"><List data={m.moderation.reports_by_reason} label={(k) => REPORT_REASON_LABEL[k as keyof typeof REPORT_REASON_LABEL] ?? k} /></div></Card>
              <Card><Heading level={3} size={4}>Reports by outcome</Heading><div className="mt-2"><List data={m.moderation.reports_by_status} /></div></Card>
              <Card><dl className="grid gap-1 text-sm">
                <div className="flex justify-between"><dt>Open now</dt><dd><strong>{m.moderation.open_now}</strong></dd></div>
                <div className="flex justify-between"><dt>Marked urgent</dt><dd><strong>{m.moderation.urgent}</strong></dd></div>
                <div className="flex justify-between"><dt>Median hours to resolve</dt><dd><strong>{m.moderation.median_hours_to_resolve ?? "none yet"}</strong></dd></div>
                <div className="flex justify-between"><dt>Open appeals</dt><dd><strong>{m.moderation.appeals_open}</strong></dd></div>
                <div className="flex justify-between"><dt>Active restrictions</dt><dd><strong>{m.moderation.restrictions_active}</strong></dd></div></dl></Card>
            </div></section>
        </div>
      )}
    </>
  );
}
