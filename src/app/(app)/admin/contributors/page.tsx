import type { Metadata } from "next";
import { AdminNav } from "@/components/content/admin-nav";
import { ContributorForm } from "@/components/governance/forms";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { listContributors } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Contributors" };
export const dynamic = "force-dynamic";

export default async function ContributorsPage() {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const contributors = await listContributors();
  return (
    <>
      <PageHeader title="Contributors" description="Authors, contributors and reviewers who can be credited on devotionals. Credits appear under each published devotional." />
      <AdminNav current="/admin/contributors" />
      <div className="grid max-w-3xl gap-6">
        <Card padding="lg">
          <Heading level={2} size={4}>Add a contributor</Heading>
          <div className="mt-3"><ContributorForm /></div>
        </Card>
        <ul className="grid gap-4">
          {contributors.map((c) => (
            <li key={c.id}>
              <Card padding="lg">
                <div className="flex items-center gap-2">
                  <Heading level={2} size={4}>{c.name}</Heading>
                  {c.active ? null : <Badge className="bg-canvas text-muted ring-1 ring-line">Not available for new credits</Badge>}
                </div>
                <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-brand">Edit</summary><div className="pt-2"><ContributorForm contributor={c} /></div></details>
              </Card>
            </li>
          ))}
        </ul>
        {contributors.length === 0 ? <Text muted>No contributors yet.</Text> : null}
      </div>
    </>
  );
}
