import type { Metadata } from "next";
import Link from "next/link";
import { aiQuota } from "@/app/actions/ai";
import { BlankWriter, EMPTY_WRITTEN, type WrittenDraft } from "@/components/create/blank-writer";
import { CreateStudio } from "@/components/create/create-studio";
import { SubmitControl, type LatestSubmission } from "@/components/create/submit-control";
import { PageHeader } from "@/components/layout/container";
import { isAiConfigured } from "@/lib/ai/devotional-ai";
import { requireAccess } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/auth/schemas";
import { isBibleCode } from "@/lib/bible/bibles";
import { docToText } from "@/lib/content/editable";
import { toLevels } from "@/lib/content/levels";
import { formatDate } from "@/lib/content/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Write a devotional" };
export const dynamic = "force-dynamic";

type Mode = "blank" | "ai";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ mode?: string; edit?: string; saved?: string }> }) {
  await requireAccess();
  const sp = await searchParams;
  const mode: Mode = sp.mode === "ai" ? "ai" : "blank";
  const quota = await aiQuota();
  const allowed = (quota?.limit ?? 0) > 0;
  const supabase = await createClient();
  // Saved devotionals stay listed (and can be submitted) even if the plan that wrote them has lapsed.
  const [{ data }, { data: subs }] = await Promise.all([
    supabase.from("presentation_versions")
      .select("id, source, title, topics, scripture, updated_at").in("source", ["ai_generated", "written"]).order("updated_at", { ascending: false }).limit(30),
    supabase.from("devotional_submissions").select("id, version_id, status, editor_note, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const mine = (data ?? []) as Array<{ id: string; source: "ai_generated" | "written"; title: string; topics: string[]; scripture: { reference?: string } | null; updated_at: string }>;
  const editing = mode === "blank" && sp.edit && uuidSchema.safeParse(sp.edit).success ? await getWritten(sp.edit) : null;
  // The newest submission of each saved devotional.
  const latest = new Map<string, LatestSubmission>();
  for (const s of (subs ?? []) as Array<{ id: string; version_id: string | null; status: NonNullable<LatestSubmission>["status"]; editor_note: string }>) {
    if (s.version_id && !latest.has(s.version_id)) latest.set(s.version_id, { id: s.id, status: s.status, editor_note: s.editor_note });
  }

  const tab = (m: Mode, label: string) => (
    <Link
      href={m === "blank" ? "/create" : "/create?mode=ai"}
      aria-current={mode === m ? "page" : undefined}
      className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-1 font-serif text-lg ${mode === m ? "border-rubric text-ink" : "border-transparent text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Write a devotional"
        description={mode === "blank"
          ? "Write your own devotional from a blank page: choose a passage, then the reflection, a question, something to practise and a prayer."
          : "Follow a thread of topics and AI writes a new devotional around a Bible passage, at your students’ reading level. You review it before anyone sees it."}
      />
      <nav aria-label="How to write it" className="mb-8 flex gap-6 border-b border-line">
        {tab("blank", "Blank devotional")}
        {tab("ai", "AI-written devotional")}
      </nav>
      {mode === "blank" ? (
        <>
          {editing ? <p className="mb-4 font-serif italic text-muted">Editing “{editing.title}”. <Link href="/create" className="text-rubric underline decoration-rubric/40 underline-offset-4">Start a new one</Link></p> : null}
          <BlankWriter key={editing?.id ?? "new"} initial={editing ?? EMPTY_WRITTEN} justSaved={Boolean(editing && sp.saved)} />
        </>
      ) : (
        <CreateStudio allowed={allowed} configured={isAiConfigured()} quota={allowed ? quota : null} />
      )}
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
                      {[d.source === "written" ? "Written by you" : "Written with AI", d.scripture?.reference, d.topics.join(", "), formatDate(d.updated_at.slice(0, 10), "short")].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="flex gap-4">
                    {d.source === "written" ? <Link href={`/create?edit=${d.id}`} className="font-semibold text-brand underline">Edit<span className="sr-only"> {d.title}</span></Link> : null}
                    <Link href={`/create/${d.id}/present`} className="font-semibold text-brand underline">Present<span className="sr-only"> {d.title}</span></Link>
                  </span>
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

/** One of the teacher's own blank-page devotionals, as the writer's starting values. */
async function getWritten(id: string): Promise<WrittenDraft | null> {
  const { data } = await (await createClient()).from("presentation_versions")
    .select("id, title, topic, scripture, content").eq("id", id).eq("source", "written").maybeSingle();
  if (!data) return null;
  const text = toLevels({ k2: data.content }).k2 ?? {};
  const scripture = (data.scripture ?? {}) as { reference?: string; translation_code?: string };
  return {
    id: data.id as string,
    title: data.title as string,
    topic: data.topic as string,
    reference: scripture.reference ?? "",
    translation: isBibleCode(scripture.translation_code) ? scripture.translation_code : "kjv",
    text: {
      reflection: text.reflection ? docToText(text.reflection) : "",
      discussion_question: text.discussion_question ? docToText(text.discussion_question) : "",
      practical_application: text.practical_application ? docToText(text.practical_application) : "",
      prayer: text.prayer ? docToText(text.prayer) : "",
    },
  };
}
