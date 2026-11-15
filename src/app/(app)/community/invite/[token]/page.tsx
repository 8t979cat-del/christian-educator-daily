import type { Metadata } from "next";
import { acceptGroupInvitationAction } from "@/app/actions/groups";
import { PageHeader } from "@/components/layout/container";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/typography";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Group invitation" };
export const dynamic = "force-dynamic";

export default async function GroupInvitePage({ params }: { params: Promise<{ token: string }> }) {
  await requireAccess();
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("preview_group_invitation", { p_token: token.slice(0, 200) });
  const invite = (data as Array<{ group_name: string; role: string }> | null)?.[0];

  return (
    <>
      <PageHeader title="Group invitation" />
      {invite ? (
        <Card className="max-w-xl">
          <Text>You have been invited to join <strong>{invite.group_name}</strong> as a {invite.role}.</Text>
          <Text size="sm" muted className="mt-2">Members can read and write posts, prayer requests and comments that only the group sees.</Text>
          <form action={acceptGroupInvitationAction} className="mt-5">
            <input type="hidden" name="token" value={token.slice(0, 200)} />
            <Button type="submit">Join the group</Button>
          </form>
        </Card>
      ) : (
        <Alert tone="error" title="This invitation is not valid">
          It may have expired, already been used, or been sent to a different email address. Sign in with the verified email address it was sent to, or ask the group leader for a new one.
        </Alert>
      )}
    </>
  );
}
