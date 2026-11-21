import type { Metadata } from "next";
import Link from "next/link";
import { aiQuota } from "@/app/actions/ai";
import { CreateStudio } from "@/components/create/create-studio";
import { SubmitControl, type LatestSubmission } from "@/components/create/submit-control";
import { PageHeader } from "@/components/layout/container";
import { isAiConfigured } from "@/lib/ai/devotional-ai";
import { requireAccess } from "@/lib/auth/session";
import { formatDate } from "@/lib/content/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Write a devotional" };
export const dynamic = "force-dynamic";

export default async function CreatePage() {
  await requireAccess();
  const quota = await aiQuota();
  const allowed = (quota?.limit ?? 0) > 0;
  const supabase = await createClient();
  // Saved devotionals stay listed (and can be submitted) even if the plan that wrote them has lapsed.
  const [{ data }, { data: subs }] = await Promise.all([
    supabase.from("presentation_versions")
      .select("id, title, topics, scripture, updated_at").eq("source", "ai_generated").order("updated_at", { ascending: false }).limit(20),
    supabase.from("devotional_submissions").select("id, version_id, status, editor_note, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const mine = (data ?? []) as Array<{ id: string; title: string; topics: string[]; scripture: { reference?: string } | null; updated_at: string }>;
  // The newest submission of each saved devotional.
  const latest = new Map<string, LatestSubmission>();
  for (const s of (subs ?? []) as Array<{ id: string; version_id: string | null; status: NonNullable<LatestSubmission>["status"]; editor_note: string }>) {
    if (s.version_id && !latest.has(s.version_id)) latest.set(s.version_id, { id: s.id, status: s.status, editor_note: s.editor_note });
  }

  return (
    <>
      <PageHeader
        title="Write a devotional"
        description="Follow a thread of topics and AI writes a new devotional around a Bible passage, at your students’ reading level. You review it before anyone sees it."
      />
      <CreateStudio allowed={allowed} configured={isAiConfigured()} quota={allowed ? quota : null} />
      {mine.length ? (
        <section aria-labelledby="mine-h" className="mt-14">
          <h2 id="mine-h" className="font-serif text-2xl font-normal">Your devotionals</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {mine.map((d) => (
              <li key={d.id} className="grid gap-2 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-serif text-lg">{d.title || "Untitled"}</p>
                    <p className="text-sm text-muted">
                      {[d.scripture?.reference, d.topics.join(", "), formatDate(d.updated_at.slice(0, 10), "short")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Link href={`/create/${d.id}/present`} className="font-semibold text-brand underline">Present</Link>
                </div>
                <SubmitControl versionId={d.id} title={d.title || "Untitled"} latest={latest.get(d.id) ?? null} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
