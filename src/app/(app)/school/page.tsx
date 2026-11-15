import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { CreateSchoolForm, InviteForm } from "@/components/forms/school-forms";
import { MemberRow } from "@/components/school/member-row";
import { deleteSchoolAction, leaveSchoolAction, revokeInvitationAction } from "@/app/actions/school";
import Link from "next/link";
import { NoticesSlot } from "@/components/billing/notices-slot";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { TextField } from "@/components/ui/form";
import { Heading, Text } from "@/components/ui/typography";
import { isSchoolManager, SCHOOL_ROLE_LABELS, type SchoolRole } from "@/lib/auth/roles";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My School" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ notice?: string }> };

type RosterRow = { user_id: string; first_name: string; last_name: string; role: SchoolRole; status: string };
type InvitationRow = { id: string; email: string; role: SchoolRole; expires_at: string };

export default async function SchoolPage({ searchParams }: Props) {
  const { notice } = await searchParams;
  const { user, memberships } = await requireAccess();
  const supabase = await createClient();

  return (
    <>
      <PageHeader title="My School" description="Faculty membership, invitations and school administration." />
      <NoticeBanner code={notice} />
      <NoticesSlot only="school" />

      {memberships.length === 0 ? (
        <div className="grid gap-6">
          <EmptyState
            icon="building"
            title="You are not in a school yet"
            description="If your administrator invited you, open the invitation link they sent you, signed in with the email address they used. Or, if you lead a school, create it below."
          />
          <Card padding="lg">
            <Heading level={2} size={4}>
              Create a school
            </Heading>
            <Text size="sm" muted className="mt-1 mb-5">
              You become its owner and can invite teachers. Your school&apos;s data is visible only to its members.
            </Text>
            <CreateSchoolForm />
          </Card>
        </div>
      ) : null}

      {await Promise.all(
        memberships.map(async (membership) => {
          const manager = isSchoolManager(membership.role);
          const [rosterResult, invitationResult] = await Promise.all([
            supabase.rpc("school_roster", { sid: membership.schoolId }),
            manager
              ? supabase
                  .from("school_invitations")
                  .select("id, email, role, expires_at")
                  .eq("school_id", membership.schoolId)
                  .is("accepted_at", null)
                  .gt("expires_at", new Date().toISOString())
                  .order("created_at", { ascending: false })
              : Promise.resolve({ data: [] as InvitationRow[] }),
          ]);
          const roster = (rosterResult.data ?? []) as RosterRow[];
          const invitations = (invitationResult.data ?? []) as InvitationRow[];

          return (
            <section key={membership.schoolId} className="mb-10 grid gap-6" aria-labelledby={`s-${membership.schoolId}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Heading level={2} size={3} id={`s-${membership.schoolId}`}>
                  {membership.schoolName}
                </Heading>
                <Badge>You: {SCHOOL_ROLE_LABELS[membership.role]}</Badge>
              </div>
              <nav aria-label={`${membership.schoolName} tools`} className="flex flex-wrap gap-3">
                <Link href={`/school/${membership.schoolId}/tools`} className={buttonStyles({ variant: "secondary" })}>Shared tools</Link>
                {manager ? <Link href={`/school/${membership.schoolId}/groups`} className={buttonStyles({ variant: "secondary" })}>School groups and activity log</Link> : null}
                {manager ? <Link href={`/school/${membership.schoolId}/billing`} className={buttonStyles({ variant: "secondary" })}>License, seats and billing</Link> : null}
              </nav>

              <Card padding="lg">
                <Heading level={3} size={4}>
                  Members ({roster.length})
                </Heading>
                <ul className="mt-2 divide-y divide-line">
                  {roster.map((member) => (
                    <MemberRow
                      key={member.user_id}
                      member={member}
                      schoolId={membership.schoolId}
                      viewerId={user.id}
                      viewerRole={membership.role}
                    />
                  ))}
                </ul>
              </Card>

              {manager ? (
                <Card padding="lg">
                  <Heading level={3} size={4}>
                    Invite a teacher
                  </Heading>
                  <Text size="sm" muted className="mt-1 mb-5">
                    Invitations are tied to the teacher&apos;s email address and expire after 14 days.
                  </Text>
                  <InviteForm schoolId={membership.schoolId} canInviteAdmin={membership.role === "owner"} />

                  {invitations.length > 0 ? (
                    <div className="mt-8">
                      <Heading level={3} size={4}>
                        Pending invitations
                      </Heading>
                      <ul className="mt-2 divide-y divide-line">
                        {invitations.map((invitation) => (
                          <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div>
                              <p className="font-medium">{invitation.email}</p>
                              <p className="text-sm text-muted">
                                {SCHOOL_ROLE_LABELS[invitation.role]}, expires{" "}
                                {new Date(invitation.expires_at).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}
                              </p>
                            </div>
                            <form action={revokeInvitationAction}>
                              <input type="hidden" name="schoolId" value={membership.schoolId} />
                              <input type="hidden" name="invitationId" value={invitation.id} />
                              <Button type="submit" variant="ghost" aria-label={`Cancel invitation for ${invitation.email}`}>
                                Cancel
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Card>
              ) : null}

              <Card padding="lg">
                <Heading level={3} size={4}>
                  Leave this school
                </Heading>
                <form action={leaveSchoolAction} className="mt-3">
                  <input type="hidden" name="schoolId" value={membership.schoolId} />
                  <Button type="submit" variant="secondary">
                    Leave {membership.schoolName}
                  </Button>
                </form>
              </Card>

              {membership.role === "owner" ? (
                <Card padding="lg" className="border-danger/40">
                  <Heading level={3} size={4}>
                    Delete this school
                  </Heading>
                  <Text size="sm" muted className="mt-1 mb-4">
                    Removes the school, all memberships and invitations for everyone. It cannot be undone.
                  </Text>
                  <form action={deleteSchoolAction} className="grid max-w-md gap-4">
                    <input type="hidden" name="schoolId" value={membership.schoolId} />
                    <TextField label={`Type “${membership.schoolName}” to confirm`} name="confirmation" autoComplete="off" required />
                    <div>
                      <Button type="submit" variant="danger">
                        Delete school
                      </Button>
                    </div>
                  </form>
                </Card>
              ) : null}
            </section>
          );
        }),
      )}
    </>
  );
}
