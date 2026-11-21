import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/content/admin-nav";
import { RichTextView } from "@/components/content/rich-text-view";
import { DeclineSubmission } from "@/components/create/decline-submission";
import { PageHeader } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { requirePlatformRole } from "@/lib/auth/session";
import { BIBLES, isBibleCode } from "@/lib/bible/bibles";
import { formatDate } from "@/lib/content/dates";
import { toLevels } from "@/lib/content/levels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submissions" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  author_name: string;
  title: string;
  topic: string;
  topics: string[];
  scripture: { reference?: string; translation_code?: string } | null;
  content: unknown;
  note: string;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  editor_note: string;
  devotional_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const PARTS = [
  ["reflection", "Reflection"],
  ["discussion_question", "A question to talk about"],
  ["practical_application", "Put it into practice"],
  ["prayer", "Closing prayer"],
] as const;

/** Devotionals teachers have submitted for publishing: read them, start a draft from one, or decline with a note. */
export default async function SubmissionsPage() {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const supabase = await createClient();
  const [{ data: waiting }, { data: recent }] = await Promise.all([
    supabase.from("devotional_submissions").select("*").eq("status", "pending").order("created_at", { ascending: true }).limit(50),
    supabase.from("devotional_submissions").select("*").in("status", ["accepted", "declined"]).order("reviewed_at", { ascending: false }).limit(15),
  ]);
  const pending = (waiting ?? []) as Row[];
  const reviewed = (recent ?? []) as Row[];

  return (
    <>
      <PageHeader title="Submissions" description="Devotionals teachers have written and sent in for publishing. Starting a draft from one accepts it; nothing is published until it goes through review and scheduling." />
      <AdminNav current="/admin/submissions" />

      {pending.length === 0 ? (
        <EmptyState title="Nothing waiting for review" description="When a teacher submits a devotional from the Write tab, it appears here." />
      ) : (
        <ol className="border-t-4 border-double border-ink/70">
          {pending.map((s) => {
            const text = toLevels({ k2: s.content }).k2 ?? {};
            const code = s.scripture?.translation_code;
            return (
              <li key={s.id} className="grid gap-4 border-b border-line py-8">
                <header>
                  <p className="font-serif text-sm italic text-muted">
                    {[s.author_name ? `From ${s.author_name}` : "From a teacher", `submitted ${formatDate(s.created_at.slice(0, 10), "short")}`].join(" · ")}
                  </p>
                  <h2 className="mt-1 font-serif text-2xl md:text-3xl">{s.title}</h2>
                  <p className="mt-1 font-serif italic text-muted">
                    {[s.topic, s.scripture?.reference ? `${s.scripture.reference}${isBibleCode(code) ? ` (${BIBLES[code].short})` : ""}` : null, s.topics.join(", ")].filter(Boolean).join(" · ")}
                  </p>
                </header>
                {s.note ? <p className="max-w-[36rem] border-l-2 border-rubric/60 pl-4 font-serif italic">“{s.note}”</p> : null}
                <details className="max-w-[40rem]">
                  <summary className="min-h-11 cursor-pointer font-semibold text-brand">Read the devotional</summary>
                  <div className="mt-3 grid gap-5">
                    {PARTS.map(([key, label]) => {
                      const doc = text[key];
                      return doc && doc.content.length ? (
                        <section key={key}>
                          <h3 className="font-serif text-lg text-rubric">{label}</h3>
                          <RichTextView doc={doc} className="mt-1 font-serif" />
                        </section>
                      ) : null;
                    })}
                  </div>
                </details>
                <div className="flex flex-wrap items-start gap-3">
                  <ButtonLink href={`/admin/devotionals/new?submission=${s.id}`}>Start a draft from this</ButtonLink>
                  <DeclineSubmission id={s.id} title={s.title} />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {reviewed.length ? (
        <section aria-labelledby="reviewed-h" className="mt-14">
          <h2 id="reviewed-h" className="font-serif text-2xl">Recently reviewed</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {reviewed.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                <span>
                  <span className="font-serif text-lg">{s.title}</span>
                  <span className="text-sm text-muted"> · {s.author_name || "a teacher"}</span>
                </span>
                <span className="text-sm">
                  {s.status === "accepted" && s.devotional_id ? (
                    <Link href={`/admin/devotionals/${s.devotional_id}`} className="font-semibold text-brand underline">Accepted: open the draft</Link>
                  ) : s.status === "accepted" ? "Accepted" : <span className="italic text-muted">Declined{s.editor_note ? `: “${s.editor_note}”` : ""}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
