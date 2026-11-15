import type { Metadata } from "next";
import Link from "next/link";
import { NoticesSlot } from "@/components/billing/notices-slot";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { buttonStyles } from "@/components/ui/button";
import { COVENANT_INTRO } from "@/lib/community/covenant";
import { communitySettings, myGroups, myRestriction } from "@/lib/community/queries";
import { requireAccess } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const { platformRoles } = await requireAccess();
  const [groups, settings, restriction] = await Promise.all([myGroups(), communitySettings(), myRestriction()]);
  const groupsOn = settings.groups_enabled !== false;
  const isModerator = platformRoles.includes("moderator") || platformRoles.includes("platform_admin");

  return (
    <>
      <PageHeader title="Community" description="Reflect on Scripture together, pray for one another, and meet in small private groups." />

      <NoticesSlot />
      {restriction ? (
        <Card tone="soft" className="mb-6">
          <Text className="font-semibold">Your community access is paused.</Text>
          <Text size="sm" className="mt-1">You can still read and use every devotional. <Link className="text-brand underline" href="/community/notices">See why and how to appeal.</Link></Text>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" padding="lg">
          <Heading level={2} size={3}>How this community works</Heading>
          <Text className="mt-3 max-w-prose">{COVENANT_INTRO}</Text>
          <ul className="mt-5 grid gap-3 text-muted">
            <li><strong className="text-ink">Conversation begins with content.</strong> Every public discussion is attached to a published devotional. There is no public feed to post into or scroll.</li>
            <li><strong className="text-ink">Prayer is quiet.</strong> You can say “I prayed for this”. There are no likes, rankings, or streaks.</li>
            <li><strong className="text-ink">Groups are private.</strong> Original posts live only in small groups whose members you know or have been invited to.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/today" className={buttonStyles({ variant: "primary" })}>Read today&apos;s devotional</Link>
            <Link href="/community/covenant" className={buttonStyles({ variant: "secondary" })}>Read the community covenant</Link>
          </div>
        </Card>

        <Card>
          <Heading level={3} size={4}>Your account</Heading>
          <ul className="mt-3 grid gap-2">
            <li><Link className="text-brand underline" href="/community/notices">Community notices, appeals and blocked people</Link></li>
            <li><Link className="text-brand underline" href="/settings">Hide or show “Reflect Together” on devotionals</Link></li>
            {isModerator ? <li><Link className="text-brand underline" href="/community/moderation">Moderation queue</Link></li> : null}
          </ul>
        </Card>
      </div>

      <section aria-labelledby="my-groups" className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Heading id="my-groups" level={2} size={3}>Your groups</Heading>
          {groupsOn ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/community/groups" className={buttonStyles({ variant: "secondary" })}>Find a group</Link>
              <Link href="/community/groups/new" className={buttonStyles({ variant: "primary" })}>Start a group</Link>
            </div>
          ) : null}
        </div>
        {!groupsOn ? (
          <EmptyState icon="users" title="Groups are paused" description="Private groups are switched off for now. Public devotional discussion is unaffected." />
        ) : groups.length === 0 ? (
          <EmptyState icon="users" title="You are not in a group yet" description="Groups are for a school faculty, a grade-level fellowship, a weekly Bible study, or a new-teacher circle. You can be invited, ask to join a discoverable group, or start one." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Card as="article" className="h-full">
                  <div className="flex flex-wrap items-center gap-2">
                    <Heading level={3} size={4}><Link className="hover:underline" href={`/community/groups/${g.id}`}>{g.name}</Link></Heading>
                    <Badge>{g.my_role === "owner" ? "Owner" : g.my_role === "moderator" ? "Moderator" : "Member"}</Badge>
                    {g.group_status === "suspended" ? <Badge className="bg-danger-soft text-danger">Suspended</Badge> : null}
                  </div>
                  {g.description ? <Text size="sm" muted className="mt-2">{g.description}</Text> : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
