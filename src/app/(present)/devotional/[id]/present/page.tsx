import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NotesEditor } from "@/components/content/notes-editor";
import { PresentMode } from "@/components/present/present-mode";
import { PresenterView } from "@/components/present/presenter-view";
import { uuidSchema } from "@/lib/auth/schemas";
import { formatDate, todayIn } from "@/lib/content/dates";
import type { PresentContent } from "@/lib/content/present";
import { getDevotional, getThemeInfo, getTranslation, getUserState } from "@/lib/content/queries";
import { scriptureDisplay } from "@/lib/content/scripture";
import { getSiteTimeZone } from "@/lib/env";
import { recordUsage } from "@/lib/governance/queries";
import { aiQuota } from "@/app/actions/ai";
import { isAiConfigured } from "@/lib/ai/devotional-ai";
import { BANDS, isBand, toLevels, type LevelVersion } from "@/lib/content/levels";
import { loadAiLevels } from "@/lib/content/ai-levels";
import { EMPTY_DOC } from "@/lib/content/richtext";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Present to class", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PresentPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { id } = await params;
  const { view } = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();

  // Row-level security hides drafts from readers, so this is "not found" for anything not live.
  const d = await getDevotional(id);
  if (!d || !["published", "scheduled"].includes(d.status) || d.devotional_date > todayIn(getSiteTimeZone())) notFound();
  void recordUsage("presentation_open");
  const [translation, theme, state, aiLevels] = await Promise.all([getTranslation(d.translation_code), getThemeInfo(d), getUserState(id), loadAiLevels(d)]);
  // Editors' versions come first; AI-adapted ones (shared by every teacher) fill the other ages.
  const aiBands = BANDS.filter((b) => aiLevels[b] && !d.levels[b]);

  // Scripture text goes to the browser only when the translation's licence allows it.
  const display = scriptureDisplay(d.scripture_text, translation);
  const content: PresentContent = {
    dateLabel: formatDate(d.devotional_date),
    title: d.title,
    topic: d.daily_topic,
    theme: theme ? { title: theme.title, summary: theme.summary, dayLabel: theme.day ? `Day ${theme.day} of 5` : "" } : null,
    scripture: {
      reference: d.scripture_reference,
      translationLabel: translation ? `${translation.name} (${translation.code.toUpperCase()})` : null,
      text: display.mode === "text" ? display.text : null,
      notice: display.mode === "text" ? display.attribution : null,
    },
    reflection: d.reflection,
    discussion: d.discussion_question,
    practice: d.practical_application,
    prayer: d.prayer,
    levels: { ...aiLevels, ...d.levels },
  };

  // The teacher's own saved versions of this devotional, one per reading level.
  const { data: versions } = await (await createClient()).from("presentation_versions").select("band, content").eq("devotional_id", id);
  const savedVersions: Partial<Record<string, Required<LevelVersion>>> = {};
  for (const v of versions ?? []) {
    // A field the teacher left empty stays empty (it is their version), so missing fields become empty documents.
    const parsed = toLevels({ k2: v.content }).k2 ?? {};
    savedVersions[isBand(v.band) ? v.band : "standard"] = {
      reflection: parsed.reflection ?? EMPTY_DOC,
      discussion_question: parsed.discussion_question ?? EMPTY_DOC,
      practical_application: parsed.practical_application ?? EMPTY_DOC,
      prayer: parsed.prayer ?? EMPTY_DOC,
    };
  }
  const quota = await aiQuota();
  const allowed = (quota?.limit ?? 0) > 0;
  const tools = { allowed, configured: isAiConfigured(), devotionalId: id, quota: allowed ? quota : null };

  // The notes are the teacher's own private note on this devotional, never part of the slides.
  const notes = <NotesEditor devotionalId={id} initial={state?.note ?? ""} />;

  if (view === "presenter") return <PresenterView devotionalId={id} title={d.title} notesSlot={notes} />;
  return (
    <PresentMode
      content={content}
      devotionalId={id}
      title={d.title}
      exitHref={`/devotional/${id}`}
      presenterHref={`/devotional/${id}/present?view=presenter`}
      notesSlot={notes}
      tools={tools}
      savedVersions={savedVersions}
      aiLevels={{ bands: aiBands, canAdapt: isAiConfigured() }}
    />
  );
}
