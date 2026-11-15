import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/content/admin-nav";
import { RetentionForm, SettingForm } from "@/components/governance/forms";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { formatWhen } from "@/lib/community/format";
import { getSiteTimeZone } from "@/lib/env";
import { adminAudit, governanceSettings } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Audit and retention" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const ENTITIES = ["platform_role", "community_setting", "governance_setting", "billing_setting", "plan", "plan_feature", "plan_price", "entitlement_grant", "resource", "school_membership", "group", "devotional", "discussion", "user", "report", "contributor", "system"];

const RETENTION: Array<[string, string, string]> = [
  ["retention_report_snapshot_days", "Closed-report quotes (days)", "After this long the quoted words in a resolved report are cleared. The record stays."],
  ["retention_moderation_snapshot_days", "Moderation-record quotes (days)", "After this long the quoted words attached to a moderation action are cleared."],
  ["retention_audit_days", "Audit log (days)", "Entries older than this are deleted."],
  ["retention_stripe_events_days", "Payment event log (days)", "Webhook receipts older than this are deleted."],
  ["retention_usage_days", "Usage counters (days)", "Daily totals older than this are deleted."],
];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; page?: string }> }) {
  await requirePlatformRole(["platform_admin"]);
  const sp = await searchParams;
  const entity = ENTITIES.includes(sp.entity ?? "") ? sp.entity! : null;
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const [rows, settings] = await Promise.all([adminAudit(PAGE + 1, page * PAGE, entity), governanceSettings()]);
  const shown = rows.slice(0, PAGE);
  const tz = getSiteTimeZone();
  const qs = (o: Record<string, string | null>) => { const s = new URLSearchParams(); for (const [k, v] of Object.entries({ entity, ...o })) if (v) s.set(k, v); return `?${s}`; };

  return (
    <>
      <PageHeader title="Audit log and retention" description="A record of administrative actions. Entries cannot be edited or deleted by anyone, including administrators; they expire only under the retention rule below." />
      <AdminNav current="/admin/audit" />
      <div className="grid gap-8">
        <section aria-label="Audit log" className="grid gap-4">
          <nav aria-label="Filter by kind" className="flex flex-wrap gap-2 text-sm">
            <Link href="?" className="rounded-control border border-line px-3 py-2 hover:bg-brand-soft">All</Link>
            {ENTITIES.map((e) => <Link key={e} href={`?entity=${e}`} aria-current={e === entity ? "page" : undefined} className={"rounded-control border px-3 py-2 hover:bg-brand-soft " + (e === entity ? "border-brand bg-brand-soft" : "border-line")}>{e.replaceAll("_", " ")}</Link>)}
          </nav>
          {shown.length === 0 ? <EmptyState icon="check" title="No entries" description="Administrative actions are recorded here." /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[44rem] text-left text-sm">
              <thead><tr><th className="py-2 pr-3">When</th><th className="pr-3">Who</th><th className="pr-3">Action</th><th className="pr-3">On</th><th>Details</th></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(r.at, tz)}</td>
                  <td className="pr-3">{r.actor_name ?? "System"}<span className="block text-xs text-muted">{r.actor_roles.join(", ").replaceAll("_", " ")}</span></td>
                  <td className="pr-3">{r.action}</td>
                  <td className="pr-3">{r.entity.replaceAll("_", " ")}{r.entity_id ? <span className="block max-w-40 truncate text-xs text-muted">{r.entity_id}</span> : null}</td>
                  <td><code className="block max-w-md whitespace-pre-wrap break-words text-xs">{JSON.stringify(r.detail)}</code></td>
                </tr>))}
              </tbody></table></div>)}
          <nav aria-label="Pages" className="flex justify-between">
            {page > 0 ? <Link className="text-brand underline" href={qs({ page: String(page - 1) })}>Newer</Link> : <span />}
            {rows.length > PAGE ? <Link className="text-brand underline" href={qs({ page: String(page + 1) })}>Older</Link> : <span />}
          </nav>
        </section>

        <section aria-label="Retention" className="grid max-w-3xl gap-4">
          <Heading level={2} size={3}>Data retention</Heading>
          <Text muted>Quoted words in reports and moderation records are the most sensitive thing kept for moderation, so they are cleared on a schedule while the record of what happened is kept. Retention runs from the scheduled job at <code>/api/cron/retention</code>; you can also run it now. The lengths below are starting points, and the right ones need a decision from your legal and safeguarding advisers.</Text>
          <Card>
            <div className="grid gap-4">
              {RETENTION.map(([key, label, help]) => <SettingForm key={key} settingKey={key} label={label} value={String(settings[key] ?? "")} help={help} />)}
            </div>
          </Card>
          <Card><Heading level={3} size={4}>Covenant</Heading>
            <Text size="sm" muted className="mt-1">Version {String(settings.covenant_version ?? 1)}. Raise the version after changing the covenant&apos;s wording in a way people should re-read: everyone will be asked to accept it again before their next contribution.</Text>
            <div className="mt-3"><SettingForm settingKey="covenant_version" label="Covenant version" value={String(settings.covenant_version ?? 1)} /></div>
          </Card>
          <Card><Heading level={3} size={4}>Run retention now</Heading><div className="mt-3"><RetentionForm /></div></Card>
        </section>
      </div>
    </>
  );
}
