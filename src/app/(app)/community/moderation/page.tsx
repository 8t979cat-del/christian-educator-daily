import type { Metadata } from "next";
import Link from "next/link";
import { liftRestrictionAction, setCommunitySettingAction, unsuspendGroupAction } from "@/app/actions/moderation";
import { ResolveAppealForm, ResolveReportForm, RestrictForm, SuspendGroupForm } from "@/components/community/moderation-forms";
import { AccountStatusForm, AdminGroupTools, ThreadControlsForm, CloseEscalationForm, DecideGroupForm, DiscussionModeForm, EscalateForm } from "@/components/governance/forms";
import { PageHeader } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { REPORT_REASON_LABEL } from "@/lib/community/covenant";
import { formatWhen } from "@/lib/community/format";
import { communitySettings, listAppeals, listPlatformReports, listRestrictions } from "@/lib/community/queries";
import { getSiteTimeZone } from "@/lib/env";
import { todayIn } from "@/lib/content/dates";
import { adminEscalations, adminGroupMembers, adminGroupOverview, discussionState, moderationHistory } from "@/lib/governance/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

const TABS = [["reports", "Reports"], ["appeals", "Appeals"], ["groups", "Groups"], ["discussions", "Discussions"], ["restrictions", "Restrictions"], ["history", "History"], ["escalations", "Escalations"], ["settings", "Settings"]] as const;
const ADMIN_ONLY = new Set(["settings", "escalations"]);

export default async function ModerationPage({ searchParams }: { searchParams: Promise<{ tab?: string; all?: string; manage?: string; status?: string }> }) {
  const ctx = await requirePlatformRole(["platform_admin", "moderator"]);
  const sp = await searchParams;
  const isAdmin = ctx.platformRoles.includes("platform_admin");
  const tab = TABS.some(([k]) => k === sp.tab && (isAdmin || !ADMIN_ONLY.has(k))) ? sp.tab! : "reports";
  const tz = getSiteTimeZone();

  return (
    <>
      <PageHeader title="Moderation" description="Handle reports with care. Hide rather than delete, say why, and never treat respectful disagreement as misconduct." />
      <nav aria-label="Moderation sections" className="mb-6 border-b border-line"><ul className="-mb-px flex flex-wrap gap-1">
        {TABS.filter(([k]) => isAdmin || !ADMIN_ONLY.has(k)).map(([k, label]) => (
          <li key={k}><Link href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={"inline-flex min-h-11 items-center border-b-2 px-4 font-semibold " + (tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink")}>{label}</Link></li>
        ))}
      </ul></nav>

      {tab === "reports" ? <Reports tz={tz} all={sp.all === "1"} isAdmin={isAdmin} /> : null}
      {tab === "groups" ? <Groups isAdmin={isAdmin} manage={sp.manage} status={sp.status} tz={tz} /> : null}
      {tab === "discussions" ? <Discussions tz={tz} /> : null}
      {tab === "history" ? <History tz={tz} /> : null}
      {tab === "escalations" && isAdmin ? <Escalations tz={tz} /> : null}
      {tab === "appeals" ? <Appeals tz={tz} /> : null}
      {tab === "restrictions" ? <Restrictions tz={tz} /> : null}
      {tab === "settings" && isAdmin ? <Settings /> : null}
    </>
  );
}

async function Reports({ tz, all, isAdmin }: { tz: string; all: boolean; isAdmin: boolean }) {
  const reports = await listPlatformReports(all ? "all" : "open");
  return (
    <section aria-label="Reports" className="grid max-w-4xl gap-4">
      <div className="flex justify-between"><Text muted>{all ? "All reports" : "Open reports"}. Reports from private groups appear only when a group leader escalates them or the group owner is the one reported.</Text>
        <Link className="text-brand underline" href={all ? "?tab=reports" : "?tab=reports&all=1"}>{all ? "Show open only" : "Show all"}</Link></div>
      {reports.length === 0 ? <EmptyState icon="check" title="No reports" description="Nothing is waiting for review." /> : (
        <ul className="grid gap-4">{reports.map((r) => (
          <li key={r.id}><Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{REPORT_REASON_LABEL[r.reason]}</Badge>
              <Badge className="bg-canvas text-ink ring-1 ring-line">{r.target_type.replace("_", " ")}{r.group_name ? ` in “${r.group_name}”` : ""}</Badge>
              {r.urgent ? <Badge className="bg-danger-soft text-danger">Urgent safety concern</Badge> : null}
              {r.is_prayer ? <Badge className="bg-canvas text-ink ring-1 ring-line">Prayer</Badge> : null}
              {r.escalated ? <Badge>Escalated to platform</Badge> : null}
              {r.admin_escalated ? <Badge className="bg-danger-soft text-danger">With an administrator</Badge> : null}
              {r.content_hidden ? <Badge className="bg-danger-soft text-danger">Hidden</Badge> : null}
              {r.status !== "open" ? <Badge className="bg-canvas text-muted ring-1 ring-line">{r.status}</Badge> : null}
            </div>
            <Text size="sm" muted className="mt-2">Author: {r.author_name ?? "unknown (account removed)"} · {r.author_violations} recent action{r.author_violations === 1 ? "" : "s"} · Reported by {r.reporter_name ?? "someone"} on {formatWhen(r.created_at, tz)}</Text>
            {r.snapshot_title ? <p className="mt-3 font-semibold">{r.snapshot_title}</p> : null}
            <blockquote className="mt-2 whitespace-pre-wrap border-l-4 border-line pl-4">{r.snapshot}</blockquote>
            {r.details ? <Text size="sm" muted className="mt-2">Reporter&apos;s note: {r.details}</Text> : null}
            {r.status === "open" ? (
              <div className="mt-4 grid gap-4">
                {r.urgent ? <Alert tone="error" title="Urgent">The reporter flagged a possible threat or risk. Review this first. If there is a credible risk to someone&apos;s safety, pass it to a platform administrator below, and follow your organization&apos;s safeguarding procedure. This queue is not monitored around the clock.</Alert> : null}
                {r.is_prayer ? <Text size="sm" muted>Prayer: hide it if it names or could identify a student, or shares sensitive details about someone else. Private prayers never appear here. A prayer that is merely unusual, long or theologically different is not a violation.</Text> : null}
                <ResolveReportForm reportId={r.id} />
                {r.target_type === "contribution" ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Lock replies or stop acknowledgements on this thread…</summary><div className="pt-2"><ThreadControlsForm contributionId={r.target_id} repliesLocked={false} acksLocked={false} isPrayer={r.is_prayer} /></div></details> : null}
                {!r.admin_escalated ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Pass to a platform administrator…</summary><div className="pt-2"><EscalateForm reportId={r.id} /></div></details> : null}
                {r.author_id ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold text-danger">Restrict this person…</summary><div className="pt-2"><RestrictForm reportId={r.id} userId={r.author_id} /></div></details> : null}
                {isAdmin && r.author_id ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold text-danger">Suspend or close this account…</summary><div className="pt-2"><Text size="sm" muted className="mb-3">This blocks the whole account, not only the community. It is the most serious step: use a restriction first unless there is a serious reason. The person is told why and can appeal.</Text><AccountStatusForm userId={r.author_id} /></div></details> : null}
                {r.group_id ? <details><summary className="min-h-11 cursor-pointer py-2 font-semibold text-danger">Suspend this group…</summary><div className="pt-2"><SuspendGroupForm groupId={r.group_id} /></div></details> : null}
              </div>
            ) : r.resolution_note ? <Text size="sm" className="mt-3"><strong>Note:</strong> {r.resolution_note}</Text> : null}
          </Card></li>))}
        </ul>
      )}
    </section>
  );
}

async function Appeals({ tz }: { tz: string }) {
  const appeals = await listAppeals("open");
  return (
    <section aria-label="Appeals" className="grid max-w-4xl gap-4">
      <Text muted>You cannot review an appeal of your own decision (a platform administrator can, when no one else is available).</Text>
      {appeals.length === 0 ? <EmptyState icon="check" title="No open appeals" description="Appeals appear here when someone asks for a decision to be reconsidered." /> : (
        <ul className="grid gap-4">{appeals.map((a) => (
          <li key={a.id}><Card>
            <div className="flex flex-wrap items-center gap-2"><Badge>{a.action.replaceAll("_", " ")}</Badge>{a.group_name ? <Badge>{a.group_name}</Badge> : null}<Text size="sm" muted>{a.user_name} · decided {formatWhen(a.action_at, tz)}</Text></div>
            <Text className="mt-2"><strong>Reason given:</strong> {a.action_reason || "none recorded"}</Text>
            {a.snapshot ? <blockquote className="mt-2 whitespace-pre-wrap border-l-4 border-line pl-4 text-muted">{a.snapshot}</blockquote> : null}
            <Text className="mt-3"><strong>Their appeal:</strong> {a.message}</Text>
            <div className="mt-4"><ResolveAppealForm appealId={a.id} /></div>
          </Card></li>))}
        </ul>
      )}
    </section>
  );
}

async function Restrictions({ tz }: { tz: string }) {
  const rows = await listRestrictions();
  return (
    <section aria-label="Restrictions" className="grid max-w-3xl gap-4">
      {rows.length === 0 ? <EmptyState icon="check" title="No active restrictions" description="Restrictions are applied from a report." /> : (
        <ul className="grid gap-3">{rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-4">
            <div><p className="font-semibold">{r.user_name} · {r.kind === "ban" ? "Removed" : "Paused"}</p>
              <p className="text-sm text-muted">{r.reason}{r.ends_at ? ` · until ${formatWhen(r.ends_at, tz)}` : ""}</p></div>
            <form action={liftRestrictionAction}><input type="hidden" name="restrictionId" value={r.id} /><Button type="submit" variant="secondary">Lift</Button></form>
          </li>))}
        </ul>
      )}
    </section>
  );
}

async function Settings() {
  const s = await communitySettings();
  const toggle = (key: string, label: string, help: string) => (
    <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line p-4">
      <div><p className="font-semibold">{label}</p><p className="text-sm text-muted">{help}</p></div>
      <form action={setCommunitySettingAction} className="flex items-center gap-3"><input type="hidden" name="key" value={key} />
        <Badge className={s[key] === true ? "" : "bg-canvas text-muted ring-1 ring-line"}>{s[key] === true ? "On" : "Off"}</Badge>
        <Button type="submit" name="value" value={s[key] === true ? "false" : "true"} variant="secondary">{s[key] === true ? "Turn off" : "Turn on"}</Button></form>
    </li>
  );
  return (
    <section aria-label="Settings" className="grid max-w-3xl gap-4">
      <Heading level={2} size={3}>Feature switches</Heading>
      <ul className="grid gap-3">
        {toggle("public_discussions_enabled", "Public devotional discussion", "When off, “Reflect Together” cannot receive new contributions or acknowledgements. Existing content is kept.")}
        {toggle("group_requires_approval", "Review new groups before they open", "When on, a group made by an ordinary educator waits in the Groups tab for approval. Groups made by school administrators and by platform staff open at once.")}
        {toggle("groups_enabled", "Private groups", "When off, groups cannot be created and members cannot post. Existing content is kept.")}
        <li className="rounded-control border border-line p-4">
          <p className="font-semibold">One-to-one messages</p>
          <p className="text-sm text-muted">Not available in this release. The database model exists but is switched off and cannot be turned on from here; it needs its own safety design first.</p>
        </li>
      </ul>
      <Card>
        <Heading level={3} size={4}>Who can start a group</Heading>
        <form action={setCommunitySettingAction} className="mt-3 flex flex-wrap items-end gap-3"><input type="hidden" name="key" value="group_creation" />
          <label className="grid gap-1 text-sm font-semibold">Policy
            <select name="value" defaultValue={String(s.group_creation ?? "verified")} className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-3 font-normal">
              <option value="verified">Any verified educator</option><option value="school_admins">School owners and administrators</option><option value="staff">Platform staff only</option>
            </select></label>
          <Button type="submit" variant="secondary">Save</Button></form>
      </Card>
      <Card>
        <Heading level={3} size={4}>Groups a person can lead</Heading>
        <form action={setCommunitySettingAction} className="mt-3 flex flex-wrap items-end gap-3"><input type="hidden" name="key" value="max_groups_owned_per_user" />
          <label className="grid gap-1 text-sm font-semibold">Maximum
            <input name="value" type="number" min={1} max={20} defaultValue={Number(s.max_groups_owned_per_user ?? 3)} className="min-h-11 w-24 rounded-control border border-line-strong/60 bg-surface px-3 font-normal" /></label>
          <Button type="submit" variant="secondary">Save</Button></form>
      </Card>
      <Card><Heading level={3} size={4}>Suspended groups</Heading><Text size="sm" muted className="mt-1">Suspend a group from the report that raised the concern. To reopen a group, enter its id.</Text>
        <form action={unsuspendGroupAction} className="mt-3 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm font-semibold">Group id<input name="groupId" required className="min-h-11 w-80 max-w-full rounded-control border border-line-strong/60 bg-surface px-3 font-normal" /></label><Button type="submit" variant="secondary">Reopen group</Button></form></Card>
    </section>
  );
}

async function Groups({ isAdmin, manage, status, tz }: { isAdmin: boolean; manage?: string; status?: string; tz: string }) {
  const filter = ["pending", "active", "suspended", "rejected"].includes(status ?? "") ? status! : null;
  const [pending, all] = await Promise.all([adminGroupOverview("pending"), adminGroupOverview(filter)]);
  const members = isAdmin && manage && /^[0-9a-f-]{36}$/.test(manage) ? await adminGroupMembers(manage) : [];
  return (
    <section aria-label="Groups" className="grid max-w-4xl gap-6">
      <Text muted>You see each group&apos;s name, purpose, status, owner and size. You never see what its members have written unless a report is escalated to you.</Text>
      <div className="grid gap-3">
        <Heading level={2} size={3}>Waiting for review ({pending.length})</Heading>
        {pending.length === 0 ? <EmptyState icon="check" title="No groups are waiting" description="New group requests appear here." /> : (
          <ul className="grid gap-4">{pending.map((g) => (
            <li key={g.id}><Card>
              <p className="font-semibold">{g.name}</p>
              <Text size="sm" muted>{g.privacy === "private" ? "Private" : "Discoverable"} · {g.category ?? "other"} · led by {g.owner_name ?? "unknown"} · requested {formatWhen(g.created_at, tz)}</Text>
              <div className="mt-3"><DecideGroupForm groupId={g.id} /></div>
            </Card></li>))}
          </ul>)}
      </div>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level={2} size={3}>All groups</Heading>
          <nav aria-label="Filter groups" className="flex flex-wrap gap-2 text-sm">
            {[null, "active", "suspended", "rejected"].map((st) => (
              <Link key={st ?? "all"} className="rounded-control border border-line px-3 py-2 hover:bg-brand-soft" href={st ? `?tab=groups&status=${st}` : "?tab=groups"}>{st ?? "all"}</Link>
            ))}
          </nav>
        </div>
        <ul className="grid gap-3">{all.map((g) => (
          <li key={g.id} className="rounded-control border border-line p-4">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{g.name}</p><Badge className="bg-canvas text-ink ring-1 ring-line">{g.status}</Badge>{g.school_name ? <Badge>{g.school_name}</Badge> : null}{g.open_reports > 0 ? <Badge className="bg-danger-soft text-danger">{g.open_reports} open report{g.open_reports === 1 ? "" : "s"}</Badge> : null}</div>
            <Text size="sm" muted>{g.privacy} · {g.member_count} member{g.member_count === 1 ? "" : "s"} · led by {g.owner_name ?? "nobody"}{g.note ? ` · ${g.note}` : ""}</Text>
            {isAdmin ? <p className="mt-2"><Link className="text-brand underline" href={`?tab=groups&manage=${g.id}`}>Manage owner and roles</Link></p> : null}
            {isAdmin && manage === g.id ? <div className="mt-4 border-t border-line pt-4"><AdminGroupTools groupId={g.id} members={members} /></div> : null}
          </li>))}
        </ul>
        <Text size="sm" muted>Membership disputes (someone removed or paused in a group) arrive as appeals. Review them in the Appeals tab: overturning a removal puts the person back in the group.</Text>
      </div>
    </section>
  );
}

async function Discussions({ tz }: { tz: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("devotionals").select("id, title, devotional_date").in("status", ["published", "scheduled"])
    .lte("devotional_date", todayIn(tz)).order("devotional_date", { ascending: false }).limit(14);
  const rows = (data ?? []) as Array<{ id: string; title: string; devotional_date: string }>;
  const states = await Promise.all(rows.map((r) => discussionState(r.id)));
  return (
    <section aria-label="Discussions" className="grid max-w-3xl gap-4">
      <Text muted>Every public conversation belongs to a published devotional. Close a discussion to keep it readable but stop new contributions, or turn it off to hide it from readers. A pinned editorial question is set by editors on the devotional&apos;s page.</Text>
      <ul className="grid gap-3">{rows.map((r, i) => {
        const st = states[i]!;
        const mode = !st.enabled ? "disabled" : st.closed ? "closed" : "open";
        return (
          <li key={r.id}><Card>
            <p className="font-semibold">{r.title}</p>
            <Text size="sm" muted>{r.devotional_date} · {mode === "open" ? "Open" : mode === "closed" ? "Closed" : "Off"}</Text>
            <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-brand">Change…</summary><div className="pt-2"><DiscussionModeForm devotionalId={r.id} mode={mode} canPin={false} /></div></details>
          </Card></li>);
      })}</ul>
    </section>
  );
}

async function History({ tz }: { tz: string }) {
  const rows = await moderationHistory(100, 0);
  return (
    <section aria-label="History" className="grid max-w-4xl gap-4">
      <Text muted>Every moderation decision, discussion control and escalation, newest first. Each entry says who acted, on whom, and why. Nothing here can be edited.</Text>
      {rows.length === 0 ? <EmptyState icon="check" title="Nothing recorded yet" description="Decisions will be listed here." /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm">
          <thead><tr><th className="py-2 pr-3">When</th><th className="pr-3">Action</th><th className="pr-3">By</th><th className="pr-3">About</th><th>Reason</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="py-2 pr-3 whitespace-nowrap">{formatWhen(r.at, tz)}</td>
              <td className="pr-3">{r.action.replaceAll("_", " ").replaceAll(".", " ")}</td>
              <td className="pr-3">{r.actor_name ?? "—"}</td>
              <td className="pr-3">{r.target_name ?? r.group_name ?? "—"}</td>
              <td>{r.reason || "—"}</td>
            </tr>))}
          </tbody></table></div>)}
    </section>
  );
}

async function Escalations({ tz }: { tz: string }) {
  const rows = await adminEscalations(true);
  return (
    <section aria-label="Escalations" className="grid max-w-4xl gap-4">
      <Alert tone="info" title="How this works">A moderator passes a case here when it may involve a credible threat, risk of harm, or a child. Decide what to do under your organization&apos;s safeguarding policy, and record it. This tool records decisions; it does not contact anyone for you, and it is not monitored around the clock.</Alert>
      {rows.length === 0 ? <EmptyState icon="check" title="Nothing escalated" description="Cases passed up by moderators appear here." /> : (
        <ul className="grid gap-4">{rows.map((r) => (
          <li key={r.id}><Card>
            <div className="flex flex-wrap items-center gap-2">{r.urgent ? <Badge className="bg-danger-soft text-danger">Urgent</Badge> : null}<Badge>{REPORT_REASON_LABEL[r.reason as keyof typeof REPORT_REASON_LABEL] ?? r.reason}</Badge>{r.closed_at ? <Badge className="bg-canvas text-muted ring-1 ring-line">Closed</Badge> : null}<Text size="sm" muted>Author: {r.author_name ?? "unknown"} · passed up {formatWhen(r.escalated_at, tz)}</Text></div>
            <blockquote className="mt-3 whitespace-pre-wrap border-l-4 border-line pl-4">{r.snapshot}</blockquote>
            <Text className="mt-3"><strong>Moderator&apos;s note:</strong> {r.note}</Text>
            {r.closed_at ? <Text className="mt-2"><strong>Outcome:</strong> {r.closed_note}</Text> : <div className="mt-4"><CloseEscalationForm reportId={r.id} /></div>}
          </Card></li>))}
        </ul>)}
    </section>
  );
}
