import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PresentMode } from "@/components/present/present-mode";
import { PresenterView } from "@/components/present/presenter-view";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { KJV, kjvPassage } from "@/lib/bible/kjv";
import { formatDate, todayIn } from "@/lib/content/dates";
import { toLevels } from "@/lib/content/levels";
import type { PresentContent } from "@/lib/content/present";
import { EMPTY_DOC } from "@/lib/content/richtext";
import { getSiteTimeZone } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Present to class", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Presents a devotional the teacher wrote with AI. Only its owner can open it (row-level security). */
export default async function PresentGeneratedPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  await requireAccess();
  const { id } = await params;
  const { view } = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { data } = await (await createClient()).from("presentation_versions")
    .select("id, title, topic, content, scripture").eq("id", id).eq("source", "ai_generated").maybeSingle();
  if (!data) notFound();

  const text = toLevels({ k2: data.content }).k2 ?? {};
  const reference = String((data.scripture as { reference?: unknown } | null)?.reference ?? "");
  // Scripture text is looked up from the bundled public-domain Bible every time; it is never stored as AI output.
  const passage = kjvPassage(reference);
  const content: PresentContent = {
    dateLabel: formatDate(todayIn(getSiteTimeZone())),
    title: data.title as string,
    topic: data.topic as string,
    theme: null,
    scripture: { reference, translationLabel: KJV.label, text: passage?.text ?? null, notice: passage ? KJV.notice : null },
    reflection: text.reflection ?? EMPTY_DOC,
    discussion: text.discussion_question ?? EMPTY_DOC,
    practice: text.practical_application ?? EMPTY_DOC,
    prayer: text.prayer ?? EMPTY_DOC,
    levels: {},
  };
  if (view === "presenter") return <PresenterView devotionalId={`own-${id}`} title={content.title} />;
  return <PresentMode content={content} devotionalId={`own-${id}`} title={content.title} exitHref="/create" presenterHref={`/create/${id}/present?view=presenter`} />;
}
