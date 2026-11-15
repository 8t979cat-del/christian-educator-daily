import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { GroupForm } from "@/components/community/group-forms";
import { Alert } from "@/components/ui/feedback";
import { requireAccess } from "@/lib/auth/session";
import { communitySettings } from "@/lib/community/queries";

export const metadata: Metadata = { title: "Start a group" };
export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const { memberships } = await requireAccess();
  const settings = await communitySettings();
  const schools = memberships.filter((m) => m.role === "owner" || m.role === "admin").map((m) => ({ id: m.schoolId, name: m.schoolName }));
  const policy = String(settings.group_creation ?? "verified");

  return (
    <>
      <PageHeader title="Start a group" description="A small, private space for a faculty, a fellowship, a Bible study or a new-teacher circle. You will be its owner." />
      {policy !== "verified" ? (
        <Alert tone="info" className="mb-6">
          {policy === "staff" ? "Groups are currently created by the platform team." : "Groups are currently created by school administrators."} If you do not have permission, you will be told when you save.
        </Alert>
      ) : null}
      {settings.group_requires_approval === true ? (
        <Alert tone="info" className="mb-6">
          New groups are reviewed by platform staff before they open, so each private space has a clear purpose and an accountable leader. Say plainly who the group is for. Groups created for a school by its administrators open at once.
        </Alert>
      ) : null}
      <GroupForm schools={schools} />
    </>
  );
}
