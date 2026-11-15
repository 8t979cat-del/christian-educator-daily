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
  const [translation, theme, state] = await Promise.all([getTranslation(d.translation_code), getThemeInfo(d), getUserState(id)]);

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
  };

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
    />
  );
}
