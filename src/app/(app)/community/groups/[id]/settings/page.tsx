import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteGroupAction } from "@/app/actions/groups";
import { GroupForm } from "@/components/community/group-forms";
import { GroupTabs } from "@/components/community/group-tabs";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { getGroup } from "@/lib/community/queries";

export const metadata: Metadata = { title: "Group settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }) {
  await requireAccess();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { notice } = await searchParams;
  const group = await getGroup(id);
  if (!group || group.my_role !== "owner") notFound();

  return (
    <>
      <PageHeader title={group.name} description="Settings" />
      <NoticeBanner code={notice} />
      <GroupTabs groupId={id} current="settings" role={group.my_role} />
      <GroupForm group={group} />
      <Card className="mt-10 max-w-2xl border-danger/40">
        <Heading level={2} size={4}>Delete this group</Heading>
        <Text size="sm" className="mt-2">This permanently deletes every post, comment and prayer in the group, and removes all members. It cannot be undone.</Text>
        <form action={deleteGroupAction} className="mt-4">
          <input type="hidden" name="groupId" value={id} />
          <details>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-danger">I understand. Show the delete button.</summary>
            <div className="pt-2"><Button type="submit" variant="danger">Delete group permanently</Button></div>
          </details>
        </form>
      </Card>
    </>
  );
}
