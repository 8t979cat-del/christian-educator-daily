import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupPostCard } from "@/components/community/group-post-card";
import { GroupTabs } from "@/components/community/group-tabs";
import { PostComposer, RequestToJoinForm } from "@/components/community/group-forms";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/typography";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { getSiteTimeZone } from "@/lib/env";
import { GROUP_POST_LABELS } from "@/lib/community/covenant";
import { getGroup, listGroupPosts } from "@/lib/community/queries";
import { CovenantNeeded } from "@/components/governance/forms";
import { covenantStatus, groupLockedPosts } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Group" };
export const dynamic = "force-dynamic";

type SP = { kind?: string; q?: string; ts?: string; id?: string; notice?: string };

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requireAccess();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const sp = await searchParams;
  const group = await getGroup(id);
  // Private groups look exactly like groups that do not exist.
  if (!group) notFound();

  const member = group.my_role !== null;
  const active = group.group_status === "active";
  const canWrite = member && active && group.my_status === "active";
  const isLeader = group.my_role === "owner" || group.my_role === "moderator";
  const kind = sp.kind && sp.kind in GROUP_POST_LABELS ? sp.kind : null;
  const cursor = sp.ts && sp.id ? { ts: sp.ts, id: sp.id } : null;
  const feed = member && active ? await listGroupPosts({ groupId: id, kind, q: sp.q?.slice(0, 100), cursor }) : null;
  const covenant = canWrite ? await covenantStatus() : null;
  const locked = member && active ? await groupLockedPosts(id) : new Set<string>();

  const qs = (o: Record<string, string | null>) => {
    const s = new URLSearchParams();
    const m: Record<string, string | null | undefined> = { kind, q: sp.q ?? null, ...o };
    for (const [k, v] of Object.entries(m)) if (v) s.set(k, v);
    return `?${s}`;
  };

  return (
    <>
      <PageHeader title={group.name} description={group.description || undefined} />
      <NoticeBanner code={sp.notice} />
      <GroupTabs groupId={id} current="feed" role={group.my_role} />

      {group.group_status === "pending" ? (
        <Alert tone="info" title="Waiting for review" className="mb-6">
          New groups are reviewed by platform staff before they open, so that every private space has a clear purpose and an accountable leader. You will see the decision here. Until then nobody can be invited and nothing can be posted.
        </Alert>
      ) : null}
      {group.group_status === "rejected" ? (
        <Alert tone="error" title="This group was not approved" className="mb-6">
          {group.suspended_reason ? `${group.suspended_reason} ` : ""}You can delete it from the group settings and start again with a clearer purpose.
        </Alert>
      ) : null}
      {group.group_status === "suspended" ? (
        <Alert tone="error" title="This group is suspended" className="mb-6">
          {group.suspended_reason ? `${group.suspended_reason} ` : ""}Its content is closed while platform staff review it.
        </Alert>
      ) : null}
      {member && group.my_status === "suspended" ? <Alert tone="info" className="mb-6">You can read this group, but posting is paused for you.</Alert> : null}

      {!member ? (
        <Card className="max-w-2xl">
          <Text>This group is open to requests. Its posts, prayers and members stay private until you are welcomed in.</Text>
          {group.purpose ? <Text size="sm" muted className="mt-2"><strong className="text-ink">Purpose:</strong> {group.purpose}</Text> : null}
          <div className="mt-4">{group.join_status === "requested" ? <Text size="sm" muted>Your request is waiting for the group&apos;s leaders.</Text> : <RequestToJoinForm groupId={id} />}</div>
        </Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
          <div className="grid gap-5">
            {canWrite ? (covenant && covenant.required && !covenant.accepted ? <CovenantNeeded version={covenant.version} /> : <PostComposer groupId={id} />) : null}
            <nav aria-label="Filter the conversation" className="flex flex-wrap gap-2">
              {[{ key: null, label: "Everything" }, ...Object.entries(GROUP_POST_LABELS).map(([key, label]) => ({ key, label }))].map((t) => (
                <Link key={t.label} href={qs({ kind: t.key, ts: null, id: null })} aria-current={(t.key ?? null) === kind ? "page" : undefined}
                  className={"inline-flex min-h-11 items-center rounded-control border px-4 text-sm font-semibold " + ((t.key ?? null) === kind ? "border-brand bg-brand-soft text-brand" : "border-line-strong/60 hover:bg-brand-soft")}>
                  {t.label}
                </Link>
              ))}
            </nav>
            <form role="search" method="get" className="flex gap-2">
              {kind ? <input type="hidden" name="kind" value={kind} /> : null}
              <label htmlFor="gq" className="sr-only">Search this group</label>
              <input id="gq" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Search this group" maxLength={100} className="min-h-11 min-w-0 flex-1 rounded-control border border-line-strong/60 bg-surface px-3" />
              <button className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-4 font-semibold hover:bg-brand-soft">Search</button>
            </form>
            {feed && feed.items.length === 0 ? (
              <EmptyState icon="users" title={sp.q || kind ? "Nothing matches" : "A quiet beginning"} description={sp.q || kind ? "Try a different filter or search." : "Be the first to share a thought, a prayer request, or a question for the group."} />
            ) : (
              <ol className="grid gap-4" aria-label="Posts, newest first">
                {feed?.items.map((p) => (
                  <li key={p.id}><GroupPostCard post={p} groupId={id} timeZone={getSiteTimeZone()} canWrite={canWrite} isLeader={isLeader && canWrite} commentsLocked={locked.has(p.id)} /></li>
                ))}
              </ol>
            )}
            <nav aria-label="More posts" className="flex justify-between">
              {cursor ? <Link className="min-h-11 py-2 text-brand underline" href={qs({ ts: null, id: null })}>Back to the newest</Link> : <span />}
              {feed?.next ? <Link className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-5 py-2 font-semibold hover:bg-brand-soft" href={qs({ ts: feed.next.ts, id: feed.next.id })}>Show earlier posts</Link> : null}
            </nav>
          </div>

          <aside aria-label="About this group" className="grid content-start gap-4">
            <Card>
              <div className="flex flex-wrap gap-2">
                <Badge>{group.privacy === "private" ? "Private" : "Discoverable"}</Badge>
                {group.is_school_group ? <Badge>School group</Badge> : null}
              </div>
              {group.purpose ? <Text size="sm" className="mt-3"><strong>Purpose.</strong> {group.purpose}</Text> : null}
              {group.guidelines ? (
                <details className="mt-3">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Group guidelines</summary>
                  <p className="whitespace-pre-wrap text-sm">{group.guidelines}</p>
                </details>
              ) : null}
              <Text size="sm" className="mt-3"><Link className="text-brand underline" href="/community/covenant">Community covenant</Link> applies here too.</Text>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
