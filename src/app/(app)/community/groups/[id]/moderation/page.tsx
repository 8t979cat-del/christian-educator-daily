import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { escalateReportAction } from "@/app/actions/moderation";
import { GroupTabs } from "@/components/community/group-tabs";
import { ResolveReportForm } from "@/components/community/moderation-forms";
import { PageHeader } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { formatWhen } from "@/lib/community/format";
import { REPORT_REASON_LABEL } from "@/lib/community/covenant";
import { getGroup, listGroupReports } from "@/lib/community/queries";
import { getSiteTimeZone } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Group moderation" };
export const dynamic = "force-dynamic";

export default async function GroupModerationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const group = await getGroup(id);
  if (!group || (group.my_role !== "owner" && group.my_role !== "moderator")) notFound();

  const supabase = await createClient();
  const [open, closed, log] = await Promise.all([
    listGroupReports(id, "open"),
    listGroupReports(id, "all"),
    supabase.from("moderation_actions").select("id, action, reason, created_at").eq("group_id", id).order("created_at", { ascending: false }).limit(30).then((r) => r.data ?? []),
  ]);
  const tz = getSiteTimeZone();
  const done = closed.filter((r) => r.status !== "open").slice(0, 10);

  return (
    <>
      <PageHeader title={group.name} description="Moderation. Reports about posts in this group come to you first." />
      <GroupTabs groupId={id} current="moderation" role={group.my_role} />
      <div className="grid max-w-3xl gap-8">
        <section aria-labelledby="open"><Heading id="open" level={2} size={3} className="mb-3">Open reports</Heading>
          {open.length === 0 ? <EmptyState icon="check" title="Nothing waiting" description="When someone reports a post or comment here, it will appear for you to review." /> : (
            <ul className="grid gap-4">
              {open.map((r) => (
                <li key={r.id}><Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{REPORT_REASON_LABEL[r.reason]}</Badge>
                    <Text size="sm" muted>{r.target_type === "group_post" ? "Post" : "Comment"} by {r.author_name ?? "a member"} · reported {formatWhen(r.created_at, tz)}</Text>
                    {r.escalated ? <Badge>With platform staff</Badge> : null}
                  </div>
                  {r.snapshot_title ? <p className="mt-3 font-semibold">{r.snapshot_title}</p> : null}
                  <blockquote className="mt-2 whitespace-pre-wrap border-l-4 border-line pl-4">{r.snapshot}</blockquote>
                  {r.details ? <Text size="sm" muted className="mt-2">Reporter&apos;s note: {r.details}</Text> : null}
                  {r.escalated ? null : (
                    <div className="mt-4 grid gap-4">
                      <ResolveReportForm reportId={r.id} />
                      <form action={escalateReportAction}><input type="hidden" name="reportId" value={r.id} />
                        <Button type="submit" variant="ghost">This needs platform staff</Button></form>
                    </div>
                  )}
                </Card></li>
              ))}
            </ul>
          )}
        </section>
        {done.length ? (
          <section aria-labelledby="done"><Heading id="done" level={2} size={3} className="mb-3">Recently handled</Heading>
            <ul className="grid gap-2">{done.map((r) => <li key={r.id} className="rounded-control border border-line p-3 text-sm">{REPORT_REASON_LABEL[r.reason]} · {r.status}{r.resolution_note ? ` · ${r.resolution_note}` : ""}</li>)}</ul>
          </section>
        ) : null}
        <section aria-labelledby="log"><Heading id="log" level={2} size={3} className="mb-3">Moderation log</Heading>
          {log.length === 0 ? <Text size="sm" muted>No actions yet.</Text> : (
            <ul className="grid gap-2">{log.map((a: { id: string; action: string; reason: string; created_at: string }) => <li key={a.id} className="rounded-control border border-line p-3 text-sm"><strong>{a.action.replaceAll("_", " ")}</strong> · {formatWhen(a.created_at, tz)}{a.reason ? ` · ${a.reason}` : ""}</li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
