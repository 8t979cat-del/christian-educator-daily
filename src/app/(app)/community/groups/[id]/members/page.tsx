import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  decideRequestAction, leaveGroupAction, removeMemberAction, revokeGroupInvitationAction,
  setMemberRoleAction, suspendMemberAction, transferOwnershipAction, unsuspendMemberAction,
} from "@/app/actions/groups";
import { GroupTabs } from "@/components/community/group-tabs";
import { InviteForm } from "@/components/community/group-forms";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { getGroup, groupRoster, listJoinRequests } from "@/lib/community/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Group members" };
export const dynamic = "force-dynamic";

const ROLE = { owner: "Owner", moderator: "Moderator", member: "Member" } as const;

export default async function MembersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  await requireAccess();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { notice } = await searchParams;
  const group = await getGroup(id);
  // Only members see a roster. Everyone else gets the same response as for a group that does not exist.
  if (!group || !group.my_role) notFound();

  const isOwner = group.my_role === "owner";
  const isLeader = isOwner || group.my_role === "moderator";
  const supabase = await createClient();
  const [roster, requests, invitations] = await Promise.all([
    groupRoster(id),
    isLeader ? listJoinRequests(id) : Promise.resolve([]),
    isLeader
      ? supabase.from("group_invitations").select("id, email, role, expires_at").eq("group_id", id).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title={group.name} description="Members" />
      <NoticeBanner code={notice} />
      <GroupTabs groupId={id} current="members" role={group.my_role} />

      <div className="grid gap-8">
        {isLeader && requests.length > 0 ? (
          <section aria-labelledby="req"><Heading id="req" level={2} size={3} className="mb-3">Requests to join</Heading>
            <ul className="grid gap-3">
              {requests.map((r) => (
                <li key={r.id}><Card>
                  <Text className="font-semibold">{r.requester_name}</Text>
                  {r.message ? <Text size="sm" muted className="mt-1">“{r.message}”</Text> : null}
                  <form action={decideRequestAction} className="mt-3 flex gap-2">
                    <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="groupId" value={id} />
                    <Button type="submit" name="decision" value="approve">Welcome them</Button>
                    <Button type="submit" name="decision" value="decline" variant="secondary">Decline</Button>
                  </form>
                </Card></li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="roster">
          <Heading id="roster" level={2} size={3} className="mb-3">People in this group ({roster.length})</Heading>
          <ul className="grid gap-3">
            {roster.map((m) => (
              <li key={m.user_id}><Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="font-semibold">{m.display_name}{m.is_me ? " (you)" : ""}</Text>
                  <Badge>{ROLE[m.role]}</Badge>
                  {m.status === "suspended" ? <Badge className="bg-danger-soft text-danger">Posting paused</Badge> : null}
                </div>
                {isLeader && !m.is_me && m.role !== "owner" && (isOwner || m.role === "member") ? (
                  <details className="mt-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-brand">Manage</summary>
                    <div className="grid gap-4 pt-2">
                      {isOwner ? (
                        <div className="flex flex-wrap gap-2">
                          <form action={setMemberRoleAction}><input type="hidden" name="groupId" value={id} /><input type="hidden" name="userId" value={m.user_id} />
                            <Button type="submit" name="role" value={m.role === "moderator" ? "member" : "moderator"} variant="secondary">{m.role === "moderator" ? "Make a regular member" : "Make a moderator"}</Button></form>
                          <form action={transferOwnershipAction}><input type="hidden" name="groupId" value={id} /><input type="hidden" name="userId" value={m.user_id} />
                            <Button type="submit" variant="secondary">Hand over ownership</Button></form>
                        </div>
                      ) : null}
                      {m.status === "suspended" ? (
                        <form action={unsuspendMemberAction}><input type="hidden" name="groupId" value={id} /><input type="hidden" name="userId" value={m.user_id} /><Button type="submit" variant="secondary">Let them post again</Button></form>
                      ) : (
                        <form action={suspendMemberAction} className="grid gap-2">
                          <input type="hidden" name="groupId" value={id} /><input type="hidden" name="userId" value={m.user_id} />
                          <label className="text-sm font-semibold" htmlFor={`sr-${m.user_id}`}>Pause posting: reason (they will read it)</label>
                          <input id={`sr-${m.user_id}`} name="reason" required maxLength={1000} className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-3" />
                          <label className="text-sm font-semibold" htmlFor={`sd-${m.user_id}`}>For how many days</label>
                          <input id={`sd-${m.user_id}`} name="days" type="number" min={1} max={365} defaultValue={7} className="min-h-11 w-32 rounded-control border border-line-strong/60 bg-surface px-3" />
                          <div><Button type="submit" variant="secondary">Pause posting</Button></div>
                        </form>
                      )}
                      <form action={removeMemberAction} className="grid gap-2">
                        <input type="hidden" name="groupId" value={id} /><input type="hidden" name="userId" value={m.user_id} />
                        <label className="text-sm font-semibold" htmlFor={`rr-${m.user_id}`}>Remove from the group: reason (they will read it)</label>
                        <input id={`rr-${m.user_id}`} name="reason" required maxLength={1000} className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-3" />
                        <div><Button type="submit" variant="danger">Remove</Button></div>
                      </form>
                    </div>
                  </details>
                ) : null}
              </Card></li>
            ))}
          </ul>
        </section>

        {isLeader ? (
          <section aria-labelledby="inv">
            <Heading id="inv" level={2} size={3} className="mb-3">Invite someone</Heading>
            <Text size="sm" muted className="mb-4 max-w-prose">An invitation works only for the verified email address you enter, and expires in 14 days. Email sending is not built yet, so you copy the link and send it yourself.</Text>
            <InviteForm groupId={id} canInviteModerators={isOwner} />
            {invitations.length > 0 ? (
              <ul className="mt-6 grid gap-2">
                {invitations.map((i: { id: string; email: string; role: string; expires_at: string }) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line p-3">
                    <span>{i.email} · {i.role}</span>
                    <form action={revokeGroupInvitationAction}><input type="hidden" name="invitationId" value={i.id} /><input type="hidden" name="groupId" value={id} /><Button type="submit" variant="ghost">Cancel invitation</Button></form>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="leave">
          <Heading id="leave" level={2} size={3} className="mb-3">Leave this group</Heading>
          <Text size="sm" muted className="mb-3">{isOwner ? "As owner you must hand ownership to someone first, unless you are the last member." : "You can leave any time. Your posts stay in the group unless you delete them first."}</Text>
          <form action={leaveGroupAction}><input type="hidden" name="groupId" value={id} /><Button type="submit" variant="secondary">Leave group</Button></form>
        </section>
      </div>
    </>
  );
}
