import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/container";
import { EmptyState } from "@/components/ui/feedback";
import { SearchInput } from "@/components/ui/search-input";
import Link from "next/link";
import { DeleteCollectionButton, NewCollectionForm, RemoveItemButton } from "@/components/billing/collection-forms";
import { UpgradeNotice } from "@/components/billing/upgrade-notice";
import { Card } from "@/components/ui/card";
import { canUse } from "@/lib/billing/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Library" };

type LibraryProps = { searchParams: Promise<{ q?: string | string[] }> };

export default async function LibraryPage({ searchParams }: LibraryProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = raw?.trim().slice(0, 200) ?? "";

  const supabase = await createClient();
  const [hasCollections, collectionsRes] = await Promise.all([
    canUse("collections"),
    supabase.from("user_collections").select("id, name, user_collection_items(devotional_id, devotionals(title))").order("created_at", { ascending: false }),
  ]);
  type Coll = { id: string; name: string; user_collection_items: { devotional_id: string; devotionals: { title: string } | null }[] };
  const collections = (collectionsRes.data ?? []) as unknown as Coll[];

  return (
    <>
      <PageHeader title="Library" description="Search devotionals by topic, Scripture reference or keyword." />
      <SearchInput action="/library" defaultValue={query} label="Search the library" placeholder="Try a topic or a verse" />
      <div className="mt-8">
        {query ? (
          <EmptyState
            icon="search"
            title={`No results for “${query}”`}
            description="The library has no published devotionals yet, so searches cannot return results. Searching will be connected when content is available."
          />
        ) : (
          <EmptyState
            icon="book"
            title="The library is empty"
            description="Topic collections and search results will appear here once devotionals have been published."
          />
        )}
      </div>
    <section className="mt-12" aria-labelledby="collections">
        <h2 id="collections" className="font-serif text-2xl font-semibold">Your collections</h2>
        {collections.length === 0 && !hasCollections ? (
          <UpgradeNotice className="mt-4" title="Saved collections are part of Educator Plus" feature="collections">
            Saving devotionals with the Save button is free; collections let you organize them into sets.
          </UpgradeNotice>
        ) : null}
        {collections.length > 0 ? (
          <div className="mt-4 grid gap-4">
            {collections.map((c) => (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-serif text-lg font-semibold">{c.name}</h3><DeleteCollectionButton id={c.id} name={c.name} /></div>
                <ul className="mt-2 grid gap-1 text-sm">
                  {c.user_collection_items.length === 0 ? <li className="text-muted">Empty. Add devotionals from their page.</li> : c.user_collection_items.map((i) => (
                    <li key={i.devotional_id} className="flex items-center justify-between gap-2">
                      <Link href={`/devotional/${i.devotional_id}`} className="underline-offset-4 hover:underline">{i.devotionals?.title ?? "A devotional outside your current plan"}</Link>
                      <RemoveItemButton collectionId={c.id} devotionalId={i.devotional_id} title={i.devotionals?.title ?? "devotional"} />
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        ) : null}
        {hasCollections ? <div className="mt-6"><NewCollectionForm /></div> : collections.length > 0 ? <UpgradeNotice className="mt-4" title="Creating new collections is part of Educator Plus" feature="collections">Yours stay available to open and delete.</UpgradeNotice> : null}
      </section>
    </>
  );
}
