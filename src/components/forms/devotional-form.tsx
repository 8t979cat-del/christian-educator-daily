"use client";

import { useActionState, useState, useTransition } from "react";
import { saveDevotionalAction } from "@/app/actions/content";
import { passageTextAction } from "@/app/actions/ai";
import { BIBLES, isBibleCode } from "@/lib/bible/bibles";
import { RichTextEditor } from "@/components/content/rich-text-editor";
import { Alert } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { CheckboxGroup } from "@/components/ui/choices";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { Heading } from "@/components/ui/typography";
import { idleState } from "@/lib/auth/form-state";
import { AUDIENCES, CATEGORIES, EDUCATIONAL_CATEGORIES, GRADE_BANDS } from "@/lib/content/options";
import { EMPTY_DOC, parseRichDoc, type RichDoc } from "@/lib/content/richtext";
import type { DevotionalRecord } from "@/lib/content/types";
import type { AiQuota } from "@/lib/ai/devotional-ai";
import { ReadingLevelsEditor } from "./reading-levels-editor";
import { FormMessage, listValue, stringValue, SubmitButton } from "./shared";

export type TranslationOption = {
  code: string;
  name: string;
  license_type: "public_domain" | "licensed" | "reference_only";
  text_allowed: boolean;
  attribution: string | null;
};
export type ThemeOption = { id: string; title: string; week_start: string };

type Initial = Partial<DevotionalRecord> & { devotional_date: string };

export function DevotionalForm({
  initial,
  translations,
  themes,
  locked,
  ai,
  submissionId,
}: {
  /** Started from a teacher's submission: saving accepts it. */
  submissionId?: string;
  /** AI drafting of reading levels (editors). */
  ai?: { configured: boolean; quota: AiQuota | null };
  initial: Initial;
  translations: TranslationOption[];
  themes: ThemeOption[];
  /** Archived devotionals are read-only until restored. */
  locked?: boolean;
}) {
  const [state, action] = useActionState(saveDevotionalAction, idleState);
  const fe = state.fieldErrors ?? {};
  const [translationCode, setTranslationCode] = useState<string>(initial.translation_code ?? "");
  const translation = translations.find((t) => t.code === translationCode) ?? null;
  const [reference, setReference] = useState<string>(stringValue(state, "scriptureReference", initial.scripture_reference ?? ""));
  const [scriptureText, setScriptureText] = useState<string>(translation?.text_allowed ? (initial.scripture_text ?? "") : "");
  const [lookup, setLookup] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [looking, startLookup] = useTransition();

  /** Fills the Scripture text from a bundled public-domain Bible (KJV, WEB, ASV). */
  const fillText = (code: string, ref: string = reference) => {
    if (!isBibleCode(code) || !ref.trim()) return;
    setLookup(null);
    startLookup(async () => {
      const result = await passageTextAction({ reference: ref, translation: code });
      if (!result.ok) { setLookup({ tone: "error", text: result.error }); return; }
      setScriptureText(result.text);
      setLookup({ tone: "ok", text: `Scripture text updated to the ${BIBLES[code].label}.` });
    });
  };

  const changeTranslation = (code: string) => {
    setTranslationCode(code);
    setLookup(null);
    const next = translations.find((t) => t.code === code);
    if (!next?.text_allowed) setScriptureText("");
    // Switching to a bundled Bible swaps the passage to that translation's words.
    else if (isBibleCode(code)) fillText(code);
  };

  const rich = (key: string, fallback: RichDoc | undefined): RichDoc => {
    const echoed = state.values?.[key];
    return (typeof echoed === "string" ? parseRichDoc(echoed) : null) ?? fallback ?? EMPTY_DOC;
  };
  const v = (key: string, fallback: string | null | undefined) => stringValue(state, key, fallback ?? "");

  const textDisabled = !translation || !translation.text_allowed;

  return (
    <form action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="id" value={initial.id ?? ""} />
      {submissionId ? <input type="hidden" name="submissionId" value={submissionId} /> : null}
      <FormMessage state={state} />
      {locked ? (
        <Alert tone="info">This devotional is archived and read-only. Restore it to draft to edit it.</Alert>
      ) : null}

      <fieldset disabled={locked} className="grid min-w-0 gap-6">
        <Card padding="lg">
          <Heading level={2} size={4}>
            Basics
          </Heading>
          <div className="mt-5 grid gap-5">
            <TextField label="Title" name="title" defaultValue={v("title", initial.title)} error={fe.title} maxLength={140} />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Date"
                name="devotionalDate"
                type="date"
                required
                defaultValue={v("devotionalDate", initial.devotional_date)}
                error={fe.devotionalDate}
                hint="The day this devotional is for."
              />
              <SelectField
                label="Weekly theme"
                name="themeId"
                defaultValue={v("themeId", initial.theme_id)}
                error={fe.themeId}
                hint="Optional. Themes cover Monday to Friday."
                options={[
                  { value: "", label: "None" },
                  ...themes.map((t) => ({ value: t.id, label: `${t.title} (week of ${t.week_start})` })),
                ]}
              />
            </div>
            <TextField
              label="Daily topic"
              name="dailyTopic"
              defaultValue={v("dailyTopic", initial.daily_topic)}
              error={fe.dailyTopic}
              hint="One line that names what today is about."
              maxLength={140}
            />
            <SelectField
              label="Category"
              name="categorySlug"
              defaultValue={v("categorySlug", initial.category_slug)}
              error={fe.categorySlug}
              options={[{ value: "", label: "Choose a category" }, ...CATEGORIES.map((c) => ({ value: c.slug, label: c.name }))]}
            />
          </div>
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>
            Scripture
          </Heading>
          <div className="mt-5 grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Reference"
                name="scriptureReference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                error={fe.scriptureReference}
                hint="For example Galatians 6:9–10. Checked and tidied when you save."
                maxLength={120}
              />
              <SelectField
                label="Translation"
                name="translationCode"
                value={translationCode}
                onChange={(event) => changeTranslation(event.target.value)}
                error={fe.translationCode}
                options={[
                  { value: "", label: "Choose a translation" },
                  ...translations.map((t) => ({
                    value: t.code,
                    label: `${t.name} (${t.code.toUpperCase()})${t.text_allowed ? "" : " · reference only"}`,
                  })),
                ]}
              />
            </div>

            {translation && !translation.text_allowed ? (
              <Alert tone="info" title={`${translation.name} is reference only`}>
                Its text cannot be stored or shown here. Readers will see the reference with a link to read the passage
                elsewhere. A platform administrator can change this under Translations if you hold a licence.
              </Alert>
            ) : null}
            {translation?.text_allowed ? (
              <Alert tone="info" title="Text may be shown">
                {translation.attribution
                  ? `This attribution appears with the passage: “${translation.attribution}”`
                  : "This translation allows its text to be shown."}
              </Alert>
            ) : null}

            <TextAreaField
              label="Scripture text"
              name="scriptureText"
              rows={5}
              disabled={textDisabled}
              value={textDisabled ? "" : scriptureText}
              onChange={(event) => setScriptureText(event.target.value)}
              error={fe.scriptureText}
              hint={
                !translation
                  ? "Choose a translation first. Leave empty to show the reference only."
                  : textDisabled
                    ? "Not available for this translation."
                    : isBibleCode(translationCode)
                      ? `Filled in from the ${BIBLES[translationCode].label} when you choose it. You can edit it, or leave it empty to show the reference only.`
                      : "Paste the passage exactly as it appears in this translation, or leave empty to show the reference only."
              }
            />
            {isBibleCode(translationCode) ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fillText(translationCode)}
                  disabled={looking || !reference.trim()}
                  className="min-h-11 text-sm font-semibold text-brand underline underline-offset-4 disabled:text-muted disabled:no-underline"
                >
                  {looking ? "Looking up the passage…" : `Fill in the text from the ${BIBLES[translationCode].short}`}
                </button>
                {lookup ? (
                  <p role={lookup.tone === "error" ? "alert" : "status"} className={`text-sm ${lookup.tone === "error" ? "text-danger" : "text-muted"}`}>{lookup.text}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>
            Devotional text
          </Heading>
          <p className="mt-2 text-sm text-muted">The standard version. Every reading level uses it unless you write that level its own version below.</p>
          <div className="mt-5 grid gap-8">
            <RichTextEditor name="reflection" label="Reflection" initial={rich("reflection", initial.reflection)} error={fe.reflection} minHeight={14} />
            <RichTextEditor name="prayer" label="Prayer" initial={rich("prayer", initial.prayer)} error={fe.prayer} minHeight={7} />
            <RichTextEditor
              name="discussionQuestion"
              label="Discussion question"
              initial={rich("discussionQuestion", initial.discussion_question)}
              error={fe.discussionQuestion}
              minHeight={6}
            />
            <RichTextEditor
              name="practicalApplication"
              label="Practical application"
              initial={rich("practicalApplication", initial.practical_application)}
              error={fe.practicalApplication}
              minHeight={7}
            />
          </div>
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>
            Reading levels
          </Heading>
          <p className="mt-2 text-sm text-muted">
            The same Scripture, written for each age. Teachers choose their students&apos; level when they present.
          </p>
          <div className="mt-5">
            <ReadingLevelsEditor initial={initial.levels ?? {}} echoed={state.values} errors={fe} ai={ai} />
          </div>
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>
            Audience
          </Heading>
          <div className="mt-5 grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Who can read it"
                name="accessLevel"
                defaultValue={v("accessLevel", initial.access_level ?? "free")}
                error={fe.accessLevel}
                hint="Free devotionals are the daily devotional every educator receives. Plus devotionals are extra content for Educator Plus and school members; they never replace the free daily."
                options={[{ value: "free", label: "Free: every educator" }, { value: "plus", label: "Educator Plus" }]}
              />
              <SelectField
                label="Intended audience"
                name="audience"
                defaultValue={v("audience", initial.audience)}
                error={fe.audience}
                options={[{ value: "", label: "Choose an audience" }, ...AUDIENCES]}
              />
              <SelectField
                label="Educational category"
                name="educationalCategory"
                defaultValue={v("educationalCategory", initial.educational_category)}
                error={fe.educationalCategory}
                options={[{ value: "", label: "Choose a category" }, ...EDUCATIONAL_CATEGORIES]}
              />
            </div>
            <CheckboxGroup
              legend="Grade levels"
              name="gradeLevels"
              options={GRADE_BANDS}
              defaultValues={listValue(state, "gradeLevels", initial.grade_levels ?? [])}
              error={fe.gradeLevels}
              hint="Choose every band this devotional suits."
            />
            <TextField
              label="Author"
              name="authorName"
              defaultValue={v("authorName", initial.author_name)}
              error={fe.authorName}
              hint="Shown to readers. Leave blank on a new devotional to use your own name."
              maxLength={120}
            />
          </div>
        </Card>

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface/95 p-4 backdrop-blur md:bottom-4">
          <SubmitButton>{initial.id ? "Save changes" : "Save draft"}</SubmitButton>
          <p className="text-sm text-muted">Saving never publishes. Publishing happens in the workflow.</p>
        </div>
      </fieldset>
    </form>
  );
}
