import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SchoolGroupTools } from "@/components/governance/forms";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { isSchoolManager } from "@/lib/auth/roles";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { formatWhen } from "@/lib/community/format";
import { getSiteTimeZone } from "@/lib/env";
import { schoolAudit, schoolGroupOverview } from "@/lib/governance/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "School groups" };
export const dynamic = "force-dynamic";

/**
 * A school's own groups, seen from outside: names, status, leader and size. School owners and
 * administrators can hand a group to another member or delete it, but they cannot read what is
 * posted inside it, and they have no view at all of groups the school does not own.
 */
export default async function SchoolGroupsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const ctx = await requireAccess();
  const membership = ctx.memberships.find((m) => m.schoolId === id);
  if (!membership || !isSchoolManager(membership.role)) notFound();

  const supabase = await createClient();
  const [groups, audit, roster] = await Promise.all([
    schoolGroupOverview(id),
    schoolAudit(id),
    supabase.rpc("school_roster", { sid: id }),
  ]);
  const people = ((roster.data ?? []) as Array<{ user_id: string; display_name?: string; first_name?: string; last_name?: string; status?: string }>)
    .filter((r) => r.status === undefined || r.status === "active")
    .map((r) => ({ value: r.user_id, label: r.display_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "Member" }));
  const tz = getSiteTimeZone();

  return (
    <>
      <PageHeader title={`${membership.schoolName}: groups and activity`} description="Groups owned by your school, and a record of membership changes." />
      <Alert tone="info" className="mb-6">
        You can see each group&apos;s name, leader and size. You cannot read what members post: private groups stay private from school leadership too. Personal prayers are never shown here.
      </Alert>
      <div className="grid max-w-3xl gap-8">
        <section aria-label="School groups" className="grid gap-4">
          <Heading level={2} size={3}>School groups</Heading>
          {groups.length === 0 ? <EmptyState icon="users" title="No school groups yet" description="Create a school group from Community, then choose your school." /> : (
            <ul className="grid gap-4">{groups.map((g) => (
              <li key={g.id}><Card>
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{g.name}</p><Badge className="bg-canvas text-ink ring-1 ring-line">{g.status}</Badge></div>
                <Text size="sm" muted>{g.member_count} member{g.member_count === 1 ? "" : "s"} · led by {g.owner_name ?? "nobody"}</Text>
                <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-brand">Manage this group…</summary>
                  <div className="pt-2"><SchoolGroupTools schoolId={id} groupId={g.id} candidates={people} /></div></details>
              </Card></li>))}
            </ul>)}
        </section>
        <section aria-label="Activity log" className="grid gap-3">
          <Heading level={2} size={3}>Membership changes</Heading>
          {audit.length === 0 ? <Text muted>Nothing recorded yet.</Text> : (
            <ul className="grid gap-2 text-sm">{audit.map((a, i) => (
              <li key={i} className="border-l-2 border-line pl-3"><strong>{a.actor_name ?? "System"}</strong> · {a.action} membership · {formatWhen(a.at, tz)}</li>))}
            </ul>)}
        </section>
        <Text size="sm"><Link className="text-brand underline" href="/school">Back to your school</Link></Text>
      </div>
    </>
  );
}
