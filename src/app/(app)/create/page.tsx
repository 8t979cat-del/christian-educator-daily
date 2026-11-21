import type { Metadata } from "next";
import Link from "next/link";
import { aiQuota } from "@/app/actions/ai";
import { CreateStudio } from "@/components/create/create-studio";
import { PageHeader } from "@/components/layout/container";
import { isAiConfigured } from "@/lib/ai/devotional-ai";
import { requireAccess } from "@/lib/auth/session";
import { canUse } from "@/lib/billing/queries";
import { formatDate } from "@/lib/content/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Write a devotional" };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  await requireAccess();
  const allowed = await canUse("ai_tools");
  const { data } = allowed
    ? await (await createClient()).from("presentation_versions")
        .select("id, title, topics, scripture, updated_at").eq("source", "ai_generated").order("updated_at", { ascending: false }).limit(20)
    : { data: [] };
  const mine = (data ?? []) as Array<{ id: string; title: string; topics: string[]; scripture: { reference?: string } | null; updated_at: string }>;

  return (
    <>
      <PageHeader
        title="Write a devotional"
        description="Follow a thread of topics and AI writes a new devotional around a Bible passage, at your students’ reading level. You review it before anyone sees it."
      />
      <CreateStudio allowed={allowed} configured={isAiConfigured()} quota={allowed ? await aiQuota() : null} />
      {mine.length ? (
        <section aria-labelledby="mine-h" className="mt-14">
          <h2 id="mine-h" className="font-serif text-2xl font-semibold">Your devotionals</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {mine.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{d.title || "Untitled"}</p>
                  <p className="text-sm text-muted">
                    {[d.scripture?.reference, d.topics.join(", "), formatDate(d.updated_at.slice(0, 10), "short")].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Link href={`/create/${d.id}/present`} className="font-semibold text-brand underline">Present</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
