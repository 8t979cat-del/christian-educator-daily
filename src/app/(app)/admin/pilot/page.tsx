import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/content/admin-nav";
import { ActionForm } from "@/components/forms/action-form";
import { TextField } from "@/components/ui/form";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert, Badge, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { createPilotAction } from "@/app/actions/launch";
import { requirePlatformRole } from "@/lib/auth/session";
import { pilotOverview } from "@/lib/launch/queries";

export const metadata: Metadata = { title: "Founding-school pilot" };
export const dynamic = "force-dynamic";

export default async function PilotListPage() {
  await requirePlatformRole(["platform_admin"]);
  const pilots = await pilotOverview();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="Founding-school pilot" description="A small, controlled pilot for a handful of Christian schools. Schools are prospects until someone records that they agreed." />
      <AdminNav current="/admin/pilot" />
      <Alert tone="info" className="mb-6">No school is assumed to have agreed. Creating a pilot invites no one and opens nothing.</Alert>
      <div className="grid gap-6">
        <Card>
          <Heading level={2} size={3}>Pilots</Heading>
          {pilots.length === 0 ? <EmptyState title="No pilot yet" description="Create one below when you are ready to plan." /> : (
            <ul className="mt-3">
              {pilots.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0">
                  <Link className="font-medium underline" href={`/admin/pilot/${p.id}`}>{p.name}</Link>
                  <Badge>{p.status}</Badge>
                  <span className="text-sm text-muted">{p.starts_on} to {p.ends_on} · {p.schools} school(s), {p.agreed} agreed</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <Heading level={2} size={3}>Create a pilot</Heading>
          <ActionForm action={createPilotAction} submit="Create in planning">
            <TextField label="Name" name="name" required maxLength={120} />
            <TextField label="Starts" name="starts_on" type="date" defaultValue={today} required />
            <TextField label="Ends" name="ends_on" type="date" hint="At most a year after the start." required />
            <TextField label="Default seats per school" name="seats" type="number" min={1} max={500} defaultValue={30} required />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
