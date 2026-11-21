import type { Metadata } from "next";
import Link from "next/link";
import { UpgradeNotice } from "@/components/billing/upgrade-notice";
import { NoticesSlot } from "@/components/billing/notices-slot";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { requireAccess } from "@/lib/auth/session";
import { kindLabel } from "@/lib/billing/resource-text";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resources" };
export const dynamic = "force-dynamic";

type Row = { id: string; kind: string; title: string; summary: string; week_of: string | null };

export default async function ResourcesPage() {
  await requireAccess();
  const supabase = await createClient();
  // Row-level security returns only what the person's plan includes; the teaser list returns titles of the rest.
  const [open, locked] = await Promise.all([
    supabase.from("resources").select("id, kind, title, summary, week_of").eq("status", "published").order("week_of", { ascending: false, nullsFirst: false }),
    supabase.rpc("locked_resources"),
  ]);
  const available = (open.data ?? []) as Row[];
  const lockedRows = (locked.data ?? []) as Row[];

  return (
    <>
      <PageHeader title="Resources" description="Weekly faculty devotionals, staff meeting guides and classroom materials." />
      <NoticesSlot />
      {available.length === 0 && lockedRows.length === 0 ? (
        <EmptyState icon="file" title="No resources yet" description="Faculty devotionals, discussion guides and presentation materials will be collected here." />
      ) : null}
      {available.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Your resources">
          {available.map((r) => (
            <li key={r.id}>
              <Link href={`/resources/${r.id}`} className="block h-full">
                <Card className="h-full hover:border-brand">
                  <Badge>{kindLabel(r.kind)}</Badge>
                  <h2 className="mt-3 font-serif text-xl font-normal">{r.title}</h2>
                  {r.summary ? <p className="mt-1 text-sm text-muted">{r.summary}</p> : null}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {lockedRows.length > 0 ? (
        <section className="mt-10" aria-labelledby="more">
          <h2 id="more" className="font-serif text-xl font-normal">More with Educator Plus</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {lockedRows.map((r) => (
              <li key={r.id} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                <Icon name="bookmark" className="mt-1 shrink-0 text-muted" />
                <div><p className="font-medium">{r.title}</p><p className="text-sm text-muted">{kindLabel(r.kind)}</p></div>
              </li>
            ))}
          </ul>
          <UpgradeNotice className="mt-4" title="These are part of Educator Plus or a School License">Everything above stays free.</UpgradeNotice>
        </section>
      ) : null}
    </>
  );
}
