import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/layout/auth-card";
import { SubmitButton } from "@/components/forms/shared";
import { Alert } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";
import { acceptInvitationAction } from "@/app/actions/school";
import { SCHOOL_ROLE_LABELS, type SchoolRole } from "@/lib/auth/roles";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "School invitation", referrer: "no-referrer" };

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function InvitePage({ params, searchParams }: Props) {
  const { token } = await params;
  const { error } = await searchParams;
  const { user } = await requireAccess({ allowIncompleteOnboarding: true });

  // The database only returns a row when the token is valid, unexpired and meant for THIS verified email.
  const supabase = await createClient();
  const { data } =
    token.length > 0 && token.length <= 200
      ? await supabase.rpc("preview_invitation", { invite_token: token })
      : { data: null };
  const invitation = (Array.isArray(data) ? data[0] : null) as { school_name: string; role: SchoolRole } | null;

  if (!invitation) {
    return (
      <AuthCard
        title="This invitation can't be used"
        description="It may have expired, already been used, or been sent to a different email address."
      >
        <p className="text-sm text-muted">
          You are signed in as <strong>{user.email}</strong>. Invitations only work for the exact address they were sent
          to. If that is a different address, sign out and sign in with it, or ask your administrator to send a new
          invitation.
        </p>
        <div className="mt-6">
          <ButtonLink href="/today" variant="secondary">
            Go to the app
          </ButtonLink>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${invitation.school_name}?`}
      description={
        <>
          You have been invited as <strong>{SCHOOL_ROLE_LABELS[invitation.role]}</strong>. Joining lets your school
          administrators see that you are a member and send you school assignments. They cannot read your prayer
          requests or private notes.
        </>
      }
      footer={
        <Link href="/today" className="font-semibold text-brand underline">
          Not now
        </Link>
      }
    >
      {error ? (
        <Alert tone="error" className="mb-6">
          We could not accept that invitation. It may have just expired.
        </Alert>
      ) : null}
      <form action={acceptInvitationAction.bind(null, token)}>
        <SubmitButton fullWidth>Join {invitation.school_name}</SubmitButton>
      </form>
    </AuthCard>
  );
}
