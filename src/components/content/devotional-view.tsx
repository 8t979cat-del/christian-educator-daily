import type { ReactNode } from "react";
import { SITE } from "@/lib/site";
import { RichTextView } from "@/components/content/rich-text-view";
import { Badge } from "@/components/ui/feedback";
import { AUDIENCES, EDUCATIONAL_CATEGORIES, GRADE_BANDS, categoryName, label } from "@/lib/content/options";
import { formatDate } from "@/lib/content/dates";
import { passageLookupUrl, scriptureDisplay, type TranslationLicense } from "@/lib/content/scripture";
import type { DevotionalRecord } from "@/lib/content/types";

export type ThemeInfo = { title: string; summary: string; day: number | null };

/**
 * The devotional as a reader sees it, in six clearly separated sections:
 * theme, Scripture, reflection, prayer, think about it, put it into practice.
 * Scripture text appears only when the translation's licence currently allows
 * it; otherwise the reference stands alone with a link to read the passage elsewhere.
 */
export function DevotionalView({
  devotional: d,
  translation,
  theme,
  actions,
}: {
  devotional: DevotionalRecord;
  translation: TranslationLicense | null;
  theme?: ThemeInfo | null;
  /** Rendered between the title and the first section (bookmark, share, print, present). */
  actions?: ReactNode;
}) {
  const display = scriptureDisplay(d.scripture_text, translation);
  const translationLabel = translation ? `${translation.name} (${translation.code.toUpperCase()})` : null;
  const grades = d.grade_levels.map((g) => label(GRADE_BANDS, g)).join(", ");

  return (
    <article className="mx-auto max-w-3xl print:max-w-none">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">{formatDate(d.devotional_date)}</p>
        <h1 className="mt-2 font-serif text-4xl font-normal leading-[1.12] md:text-5xl">
          {d.title || "Untitled devotional"}
        </h1>
      </header>

      {actions ? <div className="mt-6 print:hidden">{actions}</div> : null}

      <div className="mt-10 grid gap-8 print:mt-6 print:gap-5">
        <Section n={1} id="theme" title="Today’s theme" tone="soft">
          {theme ? (
            <p className="text-sm font-semibold text-brand">
              {theme.title}
              {theme.day ? ` · Day ${theme.day} of 5` : ""}
            </p>
          ) : null}
          {d.daily_topic ? <p className="mt-1 font-serif text-2xl leading-snug md:text-3xl">{d.daily_topic}</p> : null}
          {theme?.summary ? <p className="mt-3 text-muted">{theme.summary}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {d.category_slug ? <Badge>{categoryName(d.category_slug)}</Badge> : null}
            {d.educational_category ? <Badge>{label(EDUCATIONAL_CATEGORIES, d.educational_category)}</Badge> : null}
          </div>
        </Section>

        <Section n={2} id="scripture" title="Scripture" tone="card">
          {display.mode === "text" ? (
            <figure>
              <blockquote className="whitespace-pre-line font-serif text-xl leading-relaxed md:text-2xl">{display.text}</blockquote>
              <figcaption className="mt-4 text-sm">
                <span className="font-semibold uppercase tracking-wider text-brand">
                  {d.scripture_reference}
                  {translationLabel ? ` · ${translationLabel}` : ""}
                </span>
                <span className="mt-1 block text-muted">{display.attribution}</span>
              </figcaption>
            </figure>
          ) : (
            <div>
              <p className="font-serif text-2xl md:text-3xl">{d.scripture_reference || "No passage chosen"}</p>
              {translationLabel ? <p className="mt-1 text-sm text-muted">{translationLabel}</p> : null}
              {d.scripture_reference ? (
                <p className="mt-4 text-sm text-muted">
                  This translation’s text is not reproduced here. Read the passage in your own Bible
                  <span className="print:hidden">
                    , or{" "}
                    <a
                      href={passageLookupUrl(d.scripture_reference, d.translation_code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand underline"
                    >
                      open it on Bible Gateway<span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </span>
                  .
                </p>
              ) : null}
            </div>
          )}
        </Section>

        <Section n={3} id="reflection" title="Reflection">
          <Rich doc={d.reflection} />
        </Section>
        <Section n={4} id="prayer" title="Prayer" tone="soft">
          <Rich doc={d.prayer} />
        </Section>
        <Section n={5} id="think" title="Think about it" tone="accent">
          <Rich doc={d.discussion_question} />
        </Section>
        <Section n={6} id="practice" title="Put it into practice" tone="card">
          <Rich doc={d.practical_application} />
        </Section>
      </div>

      <footer className="mt-12 border-t border-line pt-6 text-sm text-muted">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[9rem_1fr]">
          {d.author_name ? (
            <>
              <dt className="font-semibold text-ink">Author</dt>
              <dd>{d.author_name}</dd>
            </>
          ) : null}
          {d.audience ? (
            <>
              <dt className="font-semibold text-ink">Intended for</dt>
              <dd>{label(AUDIENCES, d.audience)}</dd>
            </>
          ) : null}
          {grades ? (
            <>
              <dt className="font-semibold text-ink">Grade levels</dt>
              <dd>{grades}</dd>
            </>
          ) : null}
        </dl>
        <p className="mt-6 hidden print:block">{SITE.name}</p>
      </footer>
    </article>
  );
}

const TONES = {
  plain: "",
  card: "rounded-card border border-line bg-surface p-6 md:p-8",
  soft: "rounded-card bg-brand-soft p-6 md:p-8",
  accent: "rounded-card border-2 border-brand bg-surface p-6 md:p-8",
} as const;

function Section({
  n, id, title, tone = "plain", children,
}: {
  n: number;
  id: string;
  title: string;
  tone?: keyof typeof TONES;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`scroll-mt-24 break-inside-avoid print:rounded-none print:border-0 print:bg-transparent print:p-0 ${TONES[tone]}`}
    >
      <h2 id={`${id}-title`} className="flex items-baseline gap-3 font-serif text-xl md:text-2xl">
        {/* A red figure, as the order of the day numbers its parts. */}
        <span aria-hidden="true" className="shrink-0 text-rubric tabular-nums print:text-black">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Rich({ doc }: { doc: DevotionalRecord["reflection"] }) {
  if (doc.content.length === 0) return <p className="italic text-muted">Not written yet.</p>;
  return <RichTextView doc={doc} className="text-lg" />;
}
