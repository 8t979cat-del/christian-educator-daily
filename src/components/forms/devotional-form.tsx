"use client";

import { useActionState, useState } from "react";
import { saveDevotionalAction } from "@/app/actions/content";
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
}: {
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

  const rich = (key: string, fallback: RichDoc | undefined): RichDoc => {
    const echoed = state.values?.[key];
    return (typeof echoed === "string" ? parseRichDoc(echoed) : null) ?? fallback ?? EMPTY_DOC;
  };
  const v = (key: string, fallback: string | null | undefined) => stringValue(state, key, fallback ?? "");

  const textDisabled = !translation || !translation.text_allowed;

  return (
    <form action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="id" value={initial.id ?? ""} />
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
                defaultValue={v("scriptureReference", initial.scripture_reference)}
                error={fe.scriptureReference}
                hint="For example Galatians 6:9–10. Checked and tidied when you save."
                maxLength={120}
              />
              <SelectField
                label="Translation"
                name="translationCode"
                value={translationCode}
                onChange={(event) => setTranslationCode(event.target.value)}
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
              defaultValue={textDisabled ? "" : v("scriptureText", initial.scripture_text)}
              error={fe.scriptureText}
              hint={
                !translation
                  ? "Choose a translation first. Leave empty to show the reference only."
                  : textDisabled
                    ? "Not available for this translation."
                    : "Paste the passage exactly as it appears in this translation, or leave empty to show the reference only."
              }
            />
          </div>
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>
            Devotional text
          </Heading>
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

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface/95 p-4 shadow-sm backdrop-blur md:bottom-4">
          <SubmitButton>{initial.id ? "Save changes" : "Save draft"}</SubmitButton>
          <p className="text-sm text-muted">Saving never publishes. Publishing happens in the workflow.</p>
        </div>
      </fieldset>
    </form>
  );
}
