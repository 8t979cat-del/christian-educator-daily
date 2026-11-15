import type { Metadata } from "next";
import { AdminNav } from "@/components/content/admin-nav";
import { Pagination } from "@/components/content/pagination";
import { ResultList } from "@/components/content/result-list";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { SelectField, TextField } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { CATEGORIES, STATUSES, STATUS_LABELS } from "@/lib/content/options";
import { readSearchParams } from "@/lib/content/params";
import { searchDevotionals } from "@/lib/content/queries";
import { requirePlatformRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Devotionals" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function DevotionalsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const sp = await searchParams;
  const f = readSearchParams(sp);

  // Keep recorded statuses accurate: mark scheduled items whose time has come as published.
  const supabase = await createClient();
  await supabase.rpc("publish_due_devotionals");

  const { hits, total } = await searchDevotionals({
    query: f.query, status: f.status, category: f.category, onlyLive: false, page: f.page, pageSize: PAGE_SIZE,
  });
  const filtered = Boolean(f.query || f.status || f.category);

  return (
    <>
      <PageHeader
        title="Devotionals"
        description="Write, review, approve and schedule devotionals."
        actions={<ButtonLink href="/admin/devotionals/new">New devotional</ButtonLink>}
      />
      <AdminNav current="/admin/devotionals" />
      <NoticeBanner code={sp.notice} />

      <form method="get" className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_14rem_auto] lg:items-end" role="search">
        <TextField label="Search" name="q" defaultValue={f.query} placeholder="Title, topic, reference or words" />
        <SelectField label="Status" name="status" defaultValue={f.status ?? ""} options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))]} />
        <SelectField label="Category" name="category" defaultValue={f.category ?? ""} options={[{ value: "", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))]} />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {hits.length === 0 ? (
        <EmptyState
          icon="file"
          title={filtered ? "No devotionals match" : "No devotionals yet"}
          description={filtered ? "Try a different search or clear the filters." : "Create the first devotional. It starts as a draft and is never published until you move it through review."}
          action={filtered ? undefined : <ButtonLink href="/admin/devotionals/new">New devotional</ButtonLink>}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {total} {total === 1 ? "devotional" : "devotionals"}
          </p>
          <ResultList hits={hits} hrefFor={(id) => `/admin/devotionals/${id}`} showStatus />
          <Pagination basePath="/admin/devotionals" params={{ q: f.query, status: f.status, category: f.category }} page={f.page} pageSize={PAGE_SIZE} total={total} />
        </>
      )}
    </>
  );
}
