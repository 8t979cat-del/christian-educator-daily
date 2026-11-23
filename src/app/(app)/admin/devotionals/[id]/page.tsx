import type { Metadata } from "next";
import { COMMUNITY_ENABLED } from "@/lib/site";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/content/admin-nav";
import { StatusBadge } from "@/components/content/status-badge";
import { DevotionalForm } from "@/components/forms/devotional-form";
import { aiQuota } from "@/app/actions/ai";
import { isAiConfigured } from "@/lib/ai/devotional-ai";
import { WorkflowPanel } from "@/components/forms/workflow-panel";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { deleteDevotionalAction } from "@/app/actions/content";
import { uuidSchema } from "@/lib/auth/schemas";
import { requirePlatformRole } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/content/dates";
import { findOverlap } from "@/lib/content/passages";
import { Alert } from "@/components/ui/feedback";
import { editorialStatus, publicationStatus } from "@/lib/content/options";
import { getDevotional, getEditorNames, getHistory, listThemes, listTranslations, usedPassages } from "@/lib/content/queries";
import { missingFields } from "@/lib/content/workflow";
import { getSiteTimeZone } from "@/lib/env";
import { CreditsForm, DiscussionModeForm, PinnedQuestionForm } from "@/components/governance/forms";
import { devotionalCredits, discussionState, listContributors } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Edit devotional" };
export const dynamic = "force-dynamic";

export default async function EditDevotionalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { user, platformRoles } = await requirePlatformRole(["content_editor", "platform_admin"]);
  const { id } = await params;
  const { notice } = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  const d = await getDevotional(id);
  if (!d) notFound();

  const [translations, themes, history, discussion, contributors, credits] = await Promise.all([listTranslations(), listThemes(), getHistory(id), discussionState(id), listContributors(), devotionalCredits(id)]);
  const names = await getEditorNames([d.author_id, d.approved_by, ...history.map((h) => h.actor)]);
  const tz = getSiteTimeZone();
  const name = (userId: string | null) => (userId ? (names.get(userId) ?? "Former editor") : "System");

  // A gentle warning when this passage shares verses with another devotional within about 16 months. It never blocks saving.
  const repeat = d.scripture_reference ? findOverlap(d.scripture_reference, await usedPassages(d.devotional_date, { excludeId: d.id })) : null;

  const isAdmin = platformRoles.includes("platform_admin");
  const missing = missingFields(d);

  return (
    <>
      <PageHeader
        title={d.title || "Untitled devotional"}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge status={d.status} />
            <span>
              {editorialStatus(d.status)} · {publicationStatus(d.status)}
            </span>
          </span>
        }
        actions={<ButtonLink href={`/admin/devotionals/${id}/preview`} variant="secondary">Preview</ButtonLink>}
      />
      <AdminNav current="/admin/devotionals" />
      <NoticeBanner code={notice} />
      {repeat ? (
        <Alert tone="info" className="mb-6">
          {d.scripture_reference} shares verses with {repeat.reference} in “{repeat.title || "Untitled"}”{repeat.date ? `, ${formatDate(repeat.date, "short")}` : ""}.
          That is fine if it is on purpose; otherwise choose a different passage.
        </Alert>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <DevotionalForm
          ai={{ configured: isAiConfigured(), quota: await aiQuota() }}
          initial={d}
          translations={translations}
          themes={themes}
          locked={d.status === "archived"}
        />

        <aside className="grid gap-6 lg:sticky lg:top-24">
          <Card padding="lg">
            <Heading level={2} size={4}>
              Workflow
            </Heading>
            <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-y-1 text-sm">
              <dt className="text-muted">Author</dt>
              <dd>{d.author_name || name(d.author_id)}</dd>
              {d.approved_at ? (
                <>
                  <dt className="text-muted">Approved</dt>
                  <dd>{name(d.approved_by)}, {formatDateTime(d.approved_at, tz)}</dd>
                </>
              ) : null}
              {d.status === "scheduled" && d.publish_at ? (
                <>
                  <dt className="text-muted">Goes live</dt>
                  <dd>{formatDateTime(d.publish_at, tz)}</dd>
                </>
              ) : null}
              {d.published_at ? (
                <>
                  <dt className="text-muted">Published</dt>
                  <dd>{formatDateTime(d.published_at, tz)}</dd>
                </>
              ) : null}
            </dl>
            <div className="mt-5">
              <WorkflowPanel
                key={d.status}
                id={d.id}
                status={d.status}
                missing={missing}
                blockedOwnApproval={d.author_id === user.id && !isAdmin}
                timeZone={tz}
                defaultPublishLocal={`${d.devotional_date}T05:00`}
              />
            </div>
          </Card>

          {/* Discussion settings are hidden while community features are off (COMMUNITY_ENABLED in src/lib/site.ts). */}
          {COMMUNITY_ENABLED ? (
          <Card padding="lg">
            <Heading level={2} size={4}>Discussion</Heading>
            <Text size="sm" muted className="mt-1">Reflect Together appears only on a published devotional. Settings here apply as soon as it is live.</Text>
            <div className="mt-3 grid gap-5">
              <DiscussionModeForm devotionalId={d.id} mode={!discussion.enabled ? "disabled" : discussion.closed ? "closed" : "open"} canPin />
              <PinnedQuestionForm devotionalId={d.id} question={discussion.pinned_question ?? ""} />
            </div>
          </Card>
          ) : null}

          <Card padding="lg">
            <Heading level={2} size={4}>Credits</Heading>
            <Text size="sm" muted className="mt-1">Shown under the devotional for readers. Add people on the Contributors page.</Text>
            <div className="mt-3">
              <CreditsForm devotionalId={d.id} contributors={contributors.filter((c) => c.active || credits.some((x) => x.contributor_id === c.id))} current={credits} />
            </div>
          </Card>

          <Card padding="lg">
            <Heading level={2} size={4}>
              History
            </Heading>
            {history.length === 0 ? (
              <Text size="sm" muted className="mt-2">Nothing yet.</Text>
            ) : (
              <ol className="mt-3 grid gap-3 text-sm">
                {history.slice(0, 15).map((item, i) => (
                  <li key={i} className="border-l-2 border-line pl-3">
                    <p className="font-medium">{item.text}</p>
                    <p className="text-muted">{name(item.actor)} · {formatDateTime(item.at, tz)}</p>
                    {item.note ? <p className="mt-1 italic">“{item.note}”</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {d.status === "draft" ? (
            <Card padding="lg" className="border-danger/40">
              <Heading level={2} size={4}>
                Delete draft
              </Heading>
              <Text size="sm" muted className="mt-1">Only drafts can be deleted. This cannot be undone.</Text>
              <form action={deleteDevotionalAction} className="mt-3">
                <input type="hidden" name="id" value={d.id} />
                <Button type="submit" variant="danger">Delete this draft</Button>
              </form>
            </Card>
          ) : null}
        </aside>
      </div>
    </>
  );
}
