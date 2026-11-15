import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCollectionForm, AssignmentForm, CollectionForm, RemoveButton } from "@/components/billing/school-tool-forms";
import { PageHeader } from "@/components/layout/container";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { isSchoolManager } from "@/lib/auth/roles";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { getEngagement, getSchoolLicense } from "@/lib/billing/queries";
import { searchDevotionals } from "@/lib/content/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "School tools" };
export const dynamic = "force-dynamic";

type Row = { id: string; devotional_id: string; note: string; due_date: string | null; devotionals: { title: string; devotional_date: string } | null };

export default async function SchoolToolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const ctx = await requireAccess();
  const membership = ctx.memberships.find((m) => m.schoolId === id);
  if (!membership) notFound();
  const manager = isSchoolManager(membership.role);
  const license = await getSchoolLicense(id);

  const header = <PageHeader title={`${membership.schoolName}: shared tools`} description="Assignments and collections for your faculty."
    actions={manager ? <Link href={`/school/${id}/billing`} className={buttonStyles({ variant: "secondary" })}>License and seats</Link> : undefined} />;

  if (!license) {
    return (
      <>
        {header}
        <Alert tone="info" title="School tools need an active School License">
          {manager ? <>Start or renew the license in <Link href={`/school/${id}/billing`} className="font-semibold underline">school billing</Link>. Anything you created earlier is kept and returns when the license is active.</> : "Your school’s license is not active right now. Your own saved devotionals and writing are untouched."}
        </Alert>
      </>
    );
  }

  const supabase = await createClient();
  const [assignmentsRes, collectionsRes, devotionals, engagement] = await Promise.all([
    supabase.from("school_assignments").select("id, devotional_id, note, due_date, devotionals(title, devotional_date)").eq("school_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("school_collections").select("id, name, description, school_collection_items(devotional_id, devotionals(title, devotional_date))").eq("school_id", id).order("created_at", { ascending: false }),
    manager ? searchDevotionals({ onlyLive: true, pageSize: 50 }) : Promise.resolve({ hits: [], total: 0 }),
    manager ? getEngagement(id) : Promise.resolve(null),
  ]);
  const assignments = (assignmentsRes.data ?? []) as unknown as Row[];
  type Collection = { id: string; name: string; description: string; school_collection_items: { devotional_id: string; devotionals: { title: string; devotional_date: string } | null }[] };
  const collections = (collectionsRes.data ?? []) as unknown as Collection[];
  const picks = devotionals.hits.map((h) => ({ id: h.id, title: h.title, devotional_date: h.devotional_date }));

  return (
    <>
      {header}
      <div className="grid max-w-4xl gap-6">
        <Card padding="lg">
          <Heading level={2} size={4}>Assigned devotionals</Heading>
          {assignments.length === 0 ? <Text className="mt-2" muted>Nothing has been assigned yet.</Text> : (
            <ul className="mt-3 divide-y divide-line">
              {assignments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <Link href={`/devotional/${a.devotional_id}`} className="font-semibold text-brand underline-offset-4 hover:underline">{a.devotionals?.title ?? "Devotional"}</Link>
                    {a.due_date ? <span className="ml-2 text-sm text-muted">due {a.due_date}</span> : null}
                    {a.note ? <span className="block text-sm text-muted">{a.note}</span> : null}
                  </span>
                  {manager ? <RemoveButton kind="assignment" schoolId={id} id={a.id} name={a.devotionals?.title ?? "assignment"} /> : null}
                </li>
              ))}
            </ul>
          )}
          {manager ? <div className="mt-6 border-t border-line pt-5"><AssignmentForm schoolId={id} devotionals={picks} /></div> : null}
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>Shared collections</Heading>
          {collections.length === 0 ? <Text className="mt-2" muted>No collections yet.</Text> : (
            <div className="mt-3 grid gap-5">
              {collections.map((c) => (
                <section key={c.id} aria-label={c.name} className="rounded-control border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-serif text-lg font-semibold">{c.name}</h3>
                    {manager ? <RemoveButton kind="collection" schoolId={id} id={c.id} name={c.name} /> : null}
                  </div>
                  {c.description ? <Text size="sm" muted>{c.description}</Text> : null}
                  <ul className="mt-2 grid gap-1 text-sm">
                    {c.school_collection_items.length === 0 ? <li className="text-muted">Empty</li> : c.school_collection_items.map((item) => (
                      <li key={item.devotional_id}><Link href={`/devotional/${item.devotional_id}`} className="underline-offset-4 hover:underline">{item.devotionals?.title ?? "Devotional"}</Link></li>
                    ))}
                  </ul>
                  {manager ? <div className="mt-4"><AddToCollectionForm schoolId={id} collectionId={c.id} devotionals={picks} /></div> : null}
                </section>
              ))}
            </div>
          )}
          {manager ? <div className="mt-6 border-t border-line pt-5"><CollectionForm schoolId={id} /></div> : null}
        </Card>

        {manager && engagement ? (
          <Card padding="lg">
            <Heading level={2} size={4}>Faculty engagement (last 30 days)</Heading>
            {"error" in engagement ? (
              <Text className="mt-2" muted>Analytics are not part of this license.</Text>
            ) : engagement.suppressed ? (
              <Text className="mt-2" muted>
                Totals appear once at least {engagement.min_group} faculty are counted, so no one can be singled out. Members may also choose to be left out.
              </Text>
            ) : (
              <>
                <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
                  {[["Faculty counted", engagement.counted_members], ["Devotionals completed", engagement.devotionals_completed], ["Faculty who completed one", engagement.members_active]].map(([k, v]) => (
                    <div key={String(k)} className="rounded-control bg-brand-soft p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-serif text-2xl font-semibold">{v}</dd></div>
                  ))}
                </dl>
                <Text size="sm" muted className="mt-4">Combined totals only. Prayers, reflections, notes and individual activity are never shown here.</Text>
              </>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
