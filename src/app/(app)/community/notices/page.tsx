import type { Metadata } from "next";
import { unblockAction } from "@/app/actions/community";
import { AppealForm } from "@/components/community/moderation-forms";
import { PageHeader } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requireAccess } from "@/lib/auth/session";
import { formatWhen } from "@/lib/community/format";
import { myBlocks, myModerationNotices, myRestriction } from "@/lib/community/queries";
import { getSiteTimeZone } from "@/lib/env";

export const metadata: Metadata = { title: "Community notices" };
export const dynamic = "force-dynamic";

const WHAT: Record<string, string> = {
  hide: "A contribution of yours was hidden",
  warn: "You received a warning",
  restrict_user: "Your community access was restricted",
  group_remove_member: "You were removed from a group",
  group_suspend_member: "Your posting in a group was paused",
};

export default async function NoticesPage() {
  await requireAccess();
  const [notices, blocks, restriction] = await Promise.all([myModerationNotices(), myBlocks(), myRestriction()]);
  const tz = getSiteTimeZone();

  return (
    <>
      <PageHeader title="Community notices" description="What moderators have done about your contributions, how to appeal, and the people you have blocked." />
      {restriction ? (
        <Alert tone="error" title={restriction.kind === "ban" ? "Your community access is removed for now" : "Your community access is paused"} className="mb-6">
          {restriction.reason}{restriction.ends_at ? ` It ends ${formatWhen(restriction.ends_at, tz)}.` : ""} You can still read and use every devotional.
        </Alert>
      ) : null}

      <section aria-labelledby="n" className="grid max-w-3xl gap-4">
        <Heading id="n" level={2} size={3}>Moderation notices</Heading>
        {notices.length === 0 ? <EmptyState icon="check" title="Nothing here" description="You have no moderation notices. That is the usual state." /> : (
          <ul className="grid gap-4">
            {notices.map((n) => (
              <li key={n.id}><Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="font-semibold">{WHAT[n.action] ?? "A moderation action"}</Text>
                  {n.group_name ? <Badge>{n.group_name}</Badge> : null}
                  <Text size="sm" muted>{formatWhen(n.created_at, tz)}</Text>
                </div>
                {n.reason ? <Text className="mt-2"><strong>Reason given:</strong> {n.reason}</Text> : null}
                {n.snapshot ? <blockquote className="mt-3 whitespace-pre-wrap border-l-4 border-line pl-4 text-muted">{n.snapshot}</blockquote> : null}
                {n.appeal_status ? (
                  <Text size="sm" className="mt-3"><strong>Appeal:</strong> {n.appeal_status === "open" ? "waiting for review" : n.appeal_status === "overturned" ? "overturned. This was restored." : "reviewed, and the decision stands."}{n.appeal_note ? ` ${n.appeal_note}` : ""}</Text>
                ) : n.can_appeal ? (
                  <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand">Appeal this decision</summary><div className="pt-2"><AppealForm actionId={n.id} /></div></details>
                ) : <Text size="sm" muted className="mt-3">The 30-day appeal window has closed.</Text>}
              </Card></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="b" className="mt-10 grid max-w-3xl gap-4">
        <Heading id="b" level={2} size={3}>People you have blocked</Heading>
        {blocks.length === 0 ? <Text muted>You have not blocked anyone. You can block someone from the “Report or block” button on a contribution. They are never told.</Text> : (
          <ul className="grid gap-2">
            {blocks.map((b) => (
              <li key={b.blocked_id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3">
                <span>{b.label} · since {formatWhen(b.created_at, tz)}</span>
                <form action={unblockAction}><input type="hidden" name="blockedId" value={b.blocked_id} /><Button type="submit" variant="secondary">Unblock</Button></form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
