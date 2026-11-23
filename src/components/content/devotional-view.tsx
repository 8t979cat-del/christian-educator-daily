import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { SITE } from "@/lib/site";
import { ContributorCard, type ContributorProfile } from "@/components/content/contributor-card";
import { RichTextView } from "@/components/content/rich-text-view";
import { AUDIENCES, EDUCATIONAL_CATEGORIES, GRADE_BANDS, categoryName, label } from "@/lib/content/options";
import { passageLookupUrl, scriptureDisplay, type TranslationLicense } from "@/lib/content/scripture";
import type { DevotionalRecord } from "@/lib/content/types";

export type ThemeInfo = { title: string; summary: string; day: number | null };

/**
 * The devotional as a lesson: the date and the week's theme, the title, then the five parts
 * in the order a class meets them, grouped by the lesson's steps (Read, Talk, Do, Pray), each
 * with a short tip for the teacher. Scripture text appears only when the translation's licence
 * allows it; otherwise the reference stands alone with a way to read it elsewhere.
 */
export function DevotionalView({
  devotional: d,
  translation,
  theme,
  actions,
  credited = false,
  author = null,
}: {
  /** The contributor whose name matches the Author field: their photo shows by the byline, and clicking it opens their bio. */
  author?: ContributorProfile | null;
  devotional: DevotionalRecord;
  translation: TranslationLicense | null;
  theme?: ThemeInfo | null;
  /** Rendered under the title (present, complete, bookmark, share, print). */
  actions?: ReactNode;
  /** The page lists contributor credits itself, so the colophon leaves out the byline. */
  credited?: boolean;
}) {
  const display = scriptureDisplay(d.scripture_text, translation);
  const translationLabel = translation ? `${translation.name} (${translation.code.toUpperCase()})` : null;
  const grades = d.grade_levels.map((g) => label(GRADE_BANDS, g)).join(", ");
  const date = new Date(`${d.devotional_date}T00:00:00Z`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const kinds = [d.category_slug ? categoryName(d.category_slug) : null, d.educational_category ? label(EDUCATIONAL_CATEGORIES, d.educational_category) : null].filter(Boolean);
  const byline = !credited && d.author_name ? `Written by ${d.author_name}` : null;
  const colophon = [
    d.audience ? `For ${label(AUDIENCES, d.audience).toLowerCase()}` : null,
    grades || null,
  ].filter(Boolean);

  return (
    <article className="mx-auto w-full max-w-3xl lg:max-w-5xl print:max-w-none">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-x-8 print:block">
      {/* The lesson's heading: today's date, the week's theme with its five days, and the title. */}
      <header className="lg:col-start-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 font-semibold text-brand print:bg-transparent print:px-0">
            <Icon name="calendar" size={16} /> {weekday}
          </span>
          {theme?.title ? (
            <span className="flex items-center gap-2 text-muted">
              <span>This week: <span className="font-semibold text-ink">{theme.title}</span></span>
              {theme.day ? (
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="flex items-center gap-1 print:hidden">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span key={n} className={`size-2.5 rounded-full ${n < theme.day! ? "bg-gilt" : n === theme.day ? "bg-brand ring-2 ring-brand/25" : "bg-line"}`} />
                    ))}
                  </span>
                  <span className="whitespace-nowrap">Day {theme.day} of 5</span>
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <h1 className="mt-4 font-serif text-3xl font-semibold leading-[1.15] tracking-[-0.01em] text-balance md:text-[2.6rem]">{d.title || "Untitled devotional"}</h1>
        {d.scripture_reference ? <p className="mt-2 text-muted">{d.scripture_reference}</p> : null}
      </header>

      {d.daily_topic || theme?.summary || kinds.length ? (
        <aside aria-label="About this day" className="mt-6 max-w-[36rem] rounded-card border border-line bg-surface p-5 shadow-card lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-0 lg:self-start print:border-0 print:p-0 print:shadow-none">
          {d.daily_topic ? <p className="font-serif text-lg font-semibold leading-snug">{d.daily_topic}</p> : null}
          {theme?.summary ? <p className="mt-2 text-muted">{theme.summary}</p> : null}
          {kinds.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {kinds.map((k) => <li key={k as string} className="rounded-full bg-parchment px-2.5 py-0.5 text-sm text-muted">{k}</li>)}
            </ul>
          ) : null}
        </aside>
      ) : null}

      {actions ? <div className="mt-6 print:hidden lg:col-start-1">{actions}</div> : null}

      <div className="lg:col-start-1">
      {/* The lesson on workbook paper: every line sits on the 2rem ruling, each step's icon in the margin. */}
      <ol className="on-rules workbook-paper mt-8 overflow-hidden rounded-card border border-line pb-8 shadow-card print:mt-6 print:border-0 print:bg-none print:shadow-none">
        <Part n={0} step="Read" icon="book" id="scripture" title="Scripture" rubric="Read it aloud together. Announce the reference first.">
          {display.mode === "text" ? (
            <figure>
              <blockquote className="font-serif text-xl leading-8 md:text-[1.4rem]">
                {display.text.split("\n").map((line, i) => {
                  const verse = /^(\d{1,3})\s+(.*)$/.exec(line);
                  return (
                    <span key={i} className="block">
                      {verse ? (
                        <>
                          <sup className="align-[0.45em] text-[0.6em] leading-none text-rubric print:text-black">{verse[1]}</sup>{" "}
                          {verse[2]}
                        </>
                      ) : line}
                    </span>
                  );
                })}
              </blockquote>
              <figcaption className="font-serif text-sm italic leading-8 text-muted">
                {/* The attribution usually names the translation already; don't say it twice. */}
                {[d.scripture_reference, translation && display.attribution?.includes(translation.name) ? null : translationLabel].filter(Boolean).join(" · ")}
                {display.attribution ? <span className="block leading-8">{display.attribution}</span> : null}
              </figcaption>
            </figure>
          ) : (
            <div className="font-serif leading-8">
              <p className="text-[1.5rem]">{d.scripture_reference || "No passage chosen"}</p>
              {translationLabel ? <p className="text-sm italic text-muted">{translationLabel}</p> : null}
              {d.scripture_reference ? (
                <p className="max-w-[36rem] text-muted">
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
        </Part>
        <Part n={1} step="Read" icon="book" id="reflection" title="Reflection" rubric="Read it yourself first; it is written at your students’ level.">
          <Rich doc={d.reflection} />
        </Part>
        <Part n={2} step="Talk" icon="chat" id="think" title="A question to talk about" rubric="Let the room answer before you do.">
          <Rich doc={d.discussion_question} large />
        </Part>
        <Part n={3} step="Do" icon="target" id="practice" title="Put it into practice" rubric="One small thing to try today.">
          <Rich doc={d.practical_application} />
        </Part>
        <Part n={4} step="Pray" icon="pray" id="prayer" title="Closing prayer" rubric="Pray it together, or invite a student to read it.">
          <Rich doc={d.prayer} />
        </Part>
      </ol>

      {byline || colophon.length ? (
        <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          {byline ? (
            author ? (
              <ContributorCard profile={author}>{byline}</ContributorCard>
            ) : (
              <span className="font-semibold text-ink">{byline}</span>
            )
          ) : null}
          {colophon.length ? <span>{byline ? "· " : ""}{colophon.join(" · ")}</span> : null}
        </p>
      ) : null}
      </div>
      </div>
      <p className="mt-6 hidden font-serif print:block">{SITE.name}</p>
    </article>
  );
}

/** One part of the lesson: its icon in the margin, its title with the step (Read, Talk, Do, Pray), a short tip for the teacher, then the text. Every line is 2rem, on the rules. */
function Part({ step, icon, id, title, rubric, children }: { n: number; step: string; icon: IconName; id: string; title: string; rubric: string; children: ReactNode }) {
  return (
    <li id={id} aria-labelledby={`${id}-title`} className="relative scroll-mt-24 break-inside-avoid px-5 pt-8 sm:pl-16 sm:pr-8 md:pr-10 print:px-0">
      <span aria-hidden="true" className="absolute left-1 top-8 hidden size-8 place-items-center rounded-full bg-brand-soft text-brand sm:left-[calc((var(--wb-margin)-2rem)/2)] sm:grid print:hidden">
        <Icon name={icon} size={18} />
      </span>
      <section className="min-w-0">
        {/* The step leads the heading row, so it can never wrap away from the title. */}
        <h2 id={`${id}-title`} className="text-xl font-semibold leading-8">
          <span className="mr-2 inline-flex translate-y-[-0.1em] items-center gap-1.5 whitespace-nowrap rounded-full bg-parchment py-0.5 pl-2.5 pr-2.5 align-middle max-sm:pl-1 text-sm font-medium leading-5 text-muted print:hidden">
            <Icon name={icon} size={14} className="text-brand sm:hidden" />
            {step}<span className="sr-only">:</span>
          </span>
          {title}
        </h2>
        <p className="leading-8 text-muted print:hidden">{rubric}</p>
        <div>{children}</div>
      </section>
    </li>
  );
}

function Rich({ doc, large = false }: { doc: DevotionalRecord["reflection"]; large?: boolean }) {
  if (doc.content.length === 0) return <p className="font-serif italic leading-8 text-muted">Not written yet.</p>;
  return <RichTextView doc={doc} className={`max-w-[36rem] font-serif ${large ? "text-[1.4rem] text-balance" : "text-lg"}`} />;
}
