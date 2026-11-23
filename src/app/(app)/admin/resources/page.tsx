import type { Metadata } from "next";
import { listThemes } from "@/lib/content/queries";
import { isAiConfigured } from "@/lib/ai/devotional-ai";
import { AdminNav } from "@/components/content/admin-nav";
import { ResourceForm, StatusButton } from "@/components/billing/resource-forms";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { kindLabel } from "@/lib/billing/resource-text";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resources (admin)" };
export const dynamic = "force-dynamic";

export default async function AdminResourcesPage() {
  const { platformRoles } = await requirePlatformRole(["platform_admin", "content_editor"]);
  const supabase = await createClient();
  const { data } = await supabase.from("resources").select("id, kind, title, status, week_of, required_feature").order("created_at", { ascending: false }).limit(100);
  const themes = await listThemes();
  const rows = (data ?? []) as { id: string; kind: string; title: string; status: string; week_of: string | null; required_feature: string }[];
  return (
    <>
      <PageHeader title="Resources" description="Premium educator resources, weekly faculty devotionals, staff meeting guides and presentation materials." />
      <AdminNav current="/admin/resources" isAdmin={platformRoles.includes("platform_admin")} />
      <div className="grid max-w-3xl gap-6">
        <Card padding="lg">
          <Heading level={2} size={4}>All resources</Heading>
          {rows.length === 0 ? <Text className="mt-2" muted>No resources yet.</Text> : (
            <ul className="mt-3 divide-y divide-line">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span><span className="font-medium">{r.title}</span> <Badge className="ml-2">{kindLabel(r.kind)}</Badge> <span className="ml-2 text-sm capitalize text-muted">{r.status}</span></span>
                  <span className="flex gap-1">
                    {r.status !== "published" ? <StatusButton id={r.id} status="published" label="Publish" /> : <StatusButton id={r.id} status="draft" label="Unpublish" />}
                    {r.status !== "archived" ? <StatusButton id={r.id} status="archived" label="Archive" /> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card padding="lg"><Heading level={2} size={4} className="mb-4">New resource</Heading><ResourceForm themes={themes.map((t) => ({ id: t.id, title: t.title, week_start: t.week_start }))} ai={{ configured: isAiConfigured() }} /></Card>
      </div>
    </>
  );
}
