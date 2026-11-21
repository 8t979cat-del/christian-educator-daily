import type { Metadata } from "next";
import { AdminNav } from "@/components/content/admin-nav";
import { DevotionalForm } from "@/components/forms/devotional-form";
import { NewDevotionalWithAi } from "@/components/forms/ai-new-devotional";
import { aiQuota } from "@/app/actions/ai";
import { isAiConfigured } from "@/lib/ai/devotional-ai";
import { PageHeader } from "@/components/layout/container";
import { isValidIsoDate, todayIn } from "@/lib/content/dates";
import { listThemes, listTranslations } from "@/lib/content/queries";
import { requirePlatformRole } from "@/lib/auth/session";
import { getSiteTimeZone } from "@/lib/env";
import { uuidSchema } from "@/lib/auth/schemas";
import { biblePassage, isBibleCode } from "@/lib/bible/kjv";
import { toLevels } from "@/lib/content/levels";
import { createClient } from "@/lib/supabase/server";

/** A pending submission as the form's starting values, with the passage text from the bundled Bible. */
async function getSubmission(id: string) {
  const { data } = await (await createClient()).from("devotional_submissions")
    .select("id, author_name, title, topic, scripture, content").eq("id", id).eq("status", "pending").maybeSingle();
  if (!data) return null;
  const text = toLevels({ k2: data.content }).k2 ?? {};
  const scripture = (data.scripture ?? {}) as { reference?: string; translation_code?: string };
  const code = isBibleCode(scripture.translation_code) ? scripture.translation_code : "kjv";
  const reference = scripture.reference ?? "";
  return {
    id: data.id as string,
    author: data.author_name as string,
    initial: {
      title: data.title as string,
      daily_topic: data.topic as string,
      scripture_reference: reference,
      translation_code: code,
      scripture_text: biblePassage(code, reference, 80)?.text ?? "",
      author_name: data.author_name as string,
      ...(text.reflection ? { reflection: text.reflection } : {}),
      ...(text.prayer ? { prayer: text.prayer } : {}),
      ...(text.discussion_question ? { discussion_question: text.discussion_question } : {}),
      ...(text.practical_application ? { practical_application: text.practical_application } : {}),
    },
  };
}

export const metadata: Metadata = { title: "New devotional" };
export const dynamic = "force-dynamic";

export default async function NewDevotionalPage({ searchParams }: { searchParams: Promise<{ theme?: string; date?: string; submission?: string }> }) {
  const ctx = await requirePlatformRole(["content_editor", "platform_admin"]);
  const sp = await searchParams;
  // The author defaults to the editor's own name, shown in the field so it can be changed.
  const myName = [ctx.profile.first_name, ctx.profile.last_name].map((x) => x?.trim()).filter(Boolean).join(" ") || ctx.profile.display_name?.trim() || "";
  const [translations, themes] = await Promise.all([listTranslations(), listThemes()]);
  const themeId = themes.some((t) => t.id === sp.theme) ? sp.theme : undefined;
  const date = sp.date && isValidIsoDate(sp.date) ? sp.date : todayIn(getSiteTimeZone());
  const quota = await aiQuota();
  const ai = { configured: isAiConfigured(), quota };
  const base = { devotional_date: date, author_name: myName, ...(themeId ? { theme_id: themeId } : {}) };
  const submission = sp.submission && uuidSchema.safeParse(sp.submission).success ? await getSubmission(sp.submission) : null;
  const initial = submission ? { ...base, ...submission.initial } : base;

  return (
    <>
      <PageHeader title="New devotional" description="Saved as a draft. It is never published from this page." />
      <AdminNav current="/admin/devotionals" />
      {submission ? (
        <p className="mb-6 border-y-4 border-double border-ink/70 py-4 font-serif italic">
          Started from {submission.author ? `${submission.author}’s` : "a teacher’s"} submission. Saving this draft accepts the submission;
          set the date, theme and grades, then send it through review as usual.
        </p>
      ) : null}
      {/* Anyone with a daily AI allowance (editors, administrators) can start from an AI draft. */}
      {submission ? (
        <DevotionalForm ai={ai} initial={initial} translations={translations} themes={themes} submissionId={submission.id} />
      ) : (quota?.limit ?? 0) > 0 ? (
        <NewDevotionalWithAi ai={ai} initial={initial} translations={translations} themes={themes} />
      ) : (
        <DevotionalForm ai={ai} initial={initial} translations={translations} themes={themes} />
      )}
    </>
  );
}
