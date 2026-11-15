import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/content/admin-nav";
import { ActionForm } from "@/components/forms/action-form";
import { SelectField, TextAreaField } from "@/components/ui/form";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { triageFeedbackAction } from "@/app/actions/launch";
import { requirePlatformRole } from "@/lib/auth/session";
import { listFeedback } from "@/lib/launch/queries";

export const metadata: Metadata = { title: "Pilot feedback" };
export const dynamic = "force-dynamic";

const THEMES = ["ease_of_use", "classroom_presentation", "devotional_quality", "time_saved", "community_usefulness", "prayer_interactions", "group_participation", "willingness_to_pay", "accessibility", "bug", "other"];
const KINDS = ["survey", "bug", "feature"] as const;

export default async function FeedbackAdminPage({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  await requirePlatformRole(["platform_admin"]);
  const sp = await searchParams;
  const kind = KINDS.find((k) => k === sp.kind) ?? null;
  const status = ["new", "triaged", "planned", "done", "declined"].find((s) => s === sp.status) ?? null;
  const rows = await listFeedback(kind, status);
  return (
    <>
      <PageHeader title="Pilot feedback" description="Surveys, bug reports and feature requests, most urgent first. Review them weekly; the process is in the pilot guide." />
      <AdminNav current="/admin/feedback" />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link className="underline" href="/admin/feedback">All</Link>
        {KINDS.map((k) => <Link key={k} className="underline" href={`/admin/feedback?kind=${k}`}>{k}</Link>)}
        <Link className="underline" href="/admin/feedback?status=new">Only new</Link>
      </nav>
      {rows.length === 0 ? <EmptyState title="Nothing here yet" description="Feedback appears as pilot educators send it." /> : (
        <div className="grid gap-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <Heading level={3} size={4}>{r.title || (r.kind === "survey" ? "Survey response" : "(no title)")} <Badge>{r.kind}</Badge> <Badge>{r.status}</Badge></Heading>
              <Text size="sm" muted>{r.created_at.slice(0, 10)}{r.pilot_name ? ` · ${r.pilot_name}` : ""}{r.page_path ? ` · page ${r.page_path}` : ""}{r.severity ? ` · ${r.severity}` : ""}{r.allow_follow_up ? " · happy to be contacted" : ""}</Text>
              {r.body ? <p className="mt-2 whitespace-pre-wrap">{r.body}</p> : null}
              {Object.keys(r.ratings ?? {}).length ? <p className="mt-2 text-sm">{Object.entries(r.ratings).map(([k, v]) => `${k.replaceAll("_", " ")} ${v}/5`).join(" · ")}{r.willingness ? ` · willingness to pay: ${r.willingness}` : ""}</p> : null}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Triage</summary>
                <ActionForm action={triageFeedbackAction} submit="Save" variant="secondary" className="mt-2 grid gap-3 md:grid-cols-3">
                  <input type="hidden" name="id" value={r.id} />
                  <SelectField label="Status" name="status" defaultValue={r.status} options={["new", "triaged", "planned", "done", "declined"].map((v) => ({ value: v, label: v }))} />
                  <SelectField label="Priority" name="priority" defaultValue={r.priority} options={["unset", "high", "medium", "low"].map((v) => ({ value: v, label: v }))} />
                  <SelectField label="Theme" name="theme" defaultValue={r.theme} options={THEMES.map((v) => ({ value: v, label: v.replaceAll("_", " ") }))} />
                  <div className="md:col-span-3"><TextAreaField label="Internal note" name="note" rows={2} defaultValue={r.admin_note} maxLength={1000} /></div>
                </ActionForm>
              </details>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
