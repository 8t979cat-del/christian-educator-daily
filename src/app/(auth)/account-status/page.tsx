import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { AppealForm } from "@/components/community/moderation-forms";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { requireAccess } from "@/lib/auth/session";
import { formatWhen } from "@/lib/community/format";
import { myModerationNotices } from "@/lib/community/queries";
import { getSiteTimeZone } from "@/lib/env";
import { myAccountStatus } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where a suspended or closed account lands. It explains what happened, in the words the
 * decision-maker wrote, and offers the same appeal everyone else has. Nothing else is available.
 */
export default async function AccountStatusPage() {
  await requireAccess({ allowSuspended: true });
  const status = await myAccountStatus();
  if (!status) redirect("/today");
  const tz = getSiteTimeZone();
  const notices = (await myModerationNotices()).filter((n) => n.action === "restrict_user");

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <div>
        <Heading level={1} size={2}>{status.status === "terminated" ? "Your account has been closed" : "Your account is paused"}</Heading>
        <Text className="mt-2" muted>
          {status.status === "terminated"
            ? "A platform administrator closed this account. You cannot use Everyday Devotional unless the decision is reversed."
            : `A platform administrator paused this account${status.until ? ` until ${formatWhen(status.until, tz)}` : ""}. It reopens by itself then.`}
        </Text>
      </div>
      <Card>
        <Badge>Reason given</Badge>
        <Text className="mt-3 whitespace-pre-wrap">{status.reason}</Text>
      </Card>
      {notices.map((n) => (
        <Card key={n.id}>
          <Heading level={2} size={4}>Ask for this to be reviewed</Heading>
          <Text size="sm" muted className="mt-1">A different person reviews every appeal. You have 30 days from the decision.</Text>
          <div className="mt-3">
            {n.appeal_status ? (
              <Alert tone="info">{n.appeal_status === "open" ? "Your appeal is waiting for review." : `Appeal ${n.appeal_status}${n.appeal_note ? `: ${n.appeal_note}` : "."}`}</Alert>
            ) : n.can_appeal ? <AppealForm actionId={n.id} /> : <Text size="sm" muted>The appeal window has closed.</Text>}
          </div>
        </Card>
      ))}
      <form action={signOutAction}><Button type="submit" variant="secondary">Sign out</Button></form>
    </div>
  );
}
