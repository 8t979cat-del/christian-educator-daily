import type { Metadata } from "next";
import { AdminNav } from "@/components/content/admin-nav";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { GrantRoleForm } from "@/components/forms/school-forms";
import { revokePlatformRoleAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { PLATFORM_ROLE_LABELS, type PlatformRole } from "@/lib/auth/roles";
import { requirePlatformRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Platform admin" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ notice?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  const { notice } = await searchParams;
  // Any staff role may open this page; each section below checks its own role.
  const { platformRoles, user } = await requirePlatformRole(["platform_admin", "content_editor", "moderator"]);
  const isAdmin = platformRoles.includes("platform_admin");
  const isEditor = isAdmin || platformRoles.includes("content_editor");

  let holders: Array<{ user_id: string; role: PlatformRole; email: string }> = [];
  if (isAdmin) {
    // RLS lets platform admins read every role row. Emails come from the auth service.
    const supabase = await createClient();
    const { data } = await supabase.from("platform_roles").select("user_id, role").order("created_at");
    const admin = createAdminClient();
    holders = await Promise.all(
      ((data ?? []) as Array<{ user_id: string; role: PlatformRole }>).map(async (row) => {
        const lookup = admin ? await admin.auth.admin.getUserById(row.user_id) : null;
        return { ...row, email: lookup?.data.user?.email ?? row.user_id.slice(0, 8) };
      }),
    );
  }

  return (
    <>
      <PageHeader title="Platform admin" description="Staff tools for the Christian Educator Daily team." />
      {isEditor ? <AdminNav current="/admin" isAdmin={isAdmin} /> : null}
      <NoticeBanner code={notice} />
      <div className="grid gap-6">
        <Card padding="lg">
          <Heading level={2} size={4}>
            Your staff roles
          </Heading>
          <div className="mt-3 flex flex-wrap gap-2">
            {platformRoles.map((role) => (
              <Badge key={role}>{PLATFORM_ROLE_LABELS[role]}</Badge>
            ))}
          </div>
          <Text size="sm" muted className="mt-4">
            {isEditor
              ? "Content editors manage devotionals, weekly themes and translations from the links above. "
              : ""}
            The moderation queue for community moderators will appear here when community features are built; the role and its
            database permissions already exist.
          </Text>
        </Card>

        {isAdmin ? (
          <Card padding="lg">
            <Heading level={2} size={4}>
              Staff roles
            </Heading>
            <Text size="sm" muted className="mt-1 mb-5">
              The person must already have an account. The last platform administrator cannot be removed.
            </Text>
            <GrantRoleForm />
            <ul className="mt-8 divide-y divide-line">
              {holders.map((holder) => (
                <li key={`${holder.user_id}-${holder.role}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {holder.email} {holder.user_id === user.id ? <span className="font-normal text-muted">(you)</span> : null}
                    </p>
                    <p className="text-sm text-muted">{PLATFORM_ROLE_LABELS[holder.role]}</p>
                  </div>
                  <form action={revokePlatformRoleAction}>
                    <input type="hidden" name="userId" value={holder.user_id} />
                    <input type="hidden" name="role" value={holder.role} />
                    <Button type="submit" variant="ghost" aria-label={`Remove ${PLATFORM_ROLE_LABELS[holder.role]} from ${holder.email}`}>
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
