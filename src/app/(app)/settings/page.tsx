import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import {
  ChangePasswordForm,
  DeleteAccountForm,
  NotificationsForm,
  ProfileForm,
  ReminderForm,
} from "@/components/forms/profile-forms";
import { SharingForm } from "@/components/billing/forms";
import { ShowDiscussionsToggle } from "@/components/community/show-discussions-toggle";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireAccess } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account settings" };

function Section({ id, title, description, children, danger }: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card as="section" padding="lg" className={danger ? "border-danger/40" : undefined} aria-labelledby={`${id}-title`}>
      <Heading level={2} size={4} id={`${id}-title`}>
        {title}
      </Heading>
      {description ? <Text size="sm" muted className="mt-1">{description}</Text> : null}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default async function SettingsPage() {
  const { profile, user, roles, memberships } = await requireAccess();

  return (
    <>
      <PageHeader title="Account settings" description="Manage your profile, notifications and security." />
      <div className="grid gap-6">
        <Section id="account" title="Account">
          <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">Email</dt>
            <dd>
              {user.email}{" "}
              <Badge className="ml-2">{user.emailVerified ? "Verified" : "Not verified"}</Badge>
            </dd>
            <dt className="font-semibold">Your roles</dt>
            <dd className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <Badge key={role}>{ROLE_LABELS[role]}</Badge>
              ))}
            </dd>
          </dl>
        </Section>

        <Section id="profile" title="Profile" description="Shown to colleagues in your school once school features are used.">
          <ProfileForm profile={profile} />
        </Section>

        <Section id="reminder" title="Daily reminder" description="Optional. A repeating calendar event that nudges you to read.">
          <ReminderForm profile={profile} />
        </Section>

        <Section id="notifications" title="Notifications">
          <NotificationsForm profile={profile} />
        </Section>

        <Section id="community" title="Community" description="Participation is always optional.">
          <ShowDiscussionsToggle initial={profile.show_discussions} />
          <Text size="sm" className="mt-3"><a className="text-brand underline" href="/community/notices">Community notices and blocked people</a></Text>
        </Section>

        <Section id="plan" title="Plan and billing" description="Your plan, payment method and receipts.">
          <Text size="sm"><a className="text-brand underline" href="/settings/billing">Manage your plan and billing</a></Text>
          {memberships.length > 0 ? (
            <div className="mt-5 border-t border-line pt-5">
              <p className="mb-3 font-semibold">School privacy</p>
              <SharingForm share={profile.share_school_aggregates} />
            </div>
          ) : null}
        </Section>

        <Section id="password" title="Change password" description="You will need your current password.">
          <ChangePasswordForm />
        </Section>

        <Section
          id="delete"
          danger
          title="Delete account"
          description="This permanently deletes your account, profile and school memberships. It cannot be undone."
        >
          <DeleteAccountForm />
        </Section>
      </div>
    </>
  );
}
