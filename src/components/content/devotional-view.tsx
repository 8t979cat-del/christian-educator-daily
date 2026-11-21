import { Fragment, type ReactNode } from "react";
import { SITE } from "@/lib/site";
import { RichTextView } from "@/components/content/rich-text-view";
import { AUDIENCES, EDUCATIONAL_CATEGORIES, GRADE_BANDS, categoryName, label } from "@/lib/content/options";
import { passageLookupUrl, scriptureDisplay, type TranslationLicense } from "@/lib/content/scripture";
import type { DevotionalRecord } from "@/lib/content/types";

export type ThemeInfo = { title: string; summary: string; day: number | null };

const ROMAN = ["I", "II", "III", "IV", "V"] as const;

/**
 * The devotional as a page of the hymnal: a running head, the red calendar day
 * beside the title with the week's theme as its tune and meter, then the five
 * parts in the order a class meets them (Scripture, reflection, a question,
 * practice, prayer), each under a red numeral and a red italic rubric, divided
 * by printed rules. Scripture text appears only when the translation's licence
 * allows it; otherwise the reference stands alone with a way to read it elsewhere.
 */
export function DevotionalView({
  devotional: d,
  translation,
  theme,
  actions,
  credited = false,
}: {
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
  const day = date.getUTCDate();
  const month = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const weekday = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const meter = [theme?.title, theme?.day ? `Day ${theme.day} of 5` : null].filter(Boolean) as string[];
  const kinds = [d.category_slug ? categoryName(d.category_slug) : null, d.educational_category ? label(EDUCATIONAL_CATEGORIES, d.educational_category) : null].filter(Boolean);
  const colophon = [
    !credited && d.author_name ? `Written by ${d.author_name}` : null,
    d.audience ? `For ${label(AUDIENCES, d.audience).toLowerCase()}` : null,
    grades || null,
  ].filter(Boolean);

  return (
    <article className="mx-auto w-full max-w-3xl lg:max-w-5xl print:max-w-none">
      {/* Running head: the passage on the left, the date on the right, over a double rule. */}
      <div className="flex items-baseline justify-between gap-4 border-b-4 border-double border-ink/70 pb-2 font-serif text-sm text-muted">
        <span className="truncate">{d.scripture_reference || SITE.wordmark}</span>
        <span className="shrink-0 italic">{weekday}</span>
      </div>

      {/* The day's page: the text column, and on wide screens a hairline-ruled margin for the tune and meter notes. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-x-12 print:block">
      <header className="mt-6 flex items-start gap-5 md:gap-7 lg:col-start-1">
        <p aria-hidden="true" className="grid shrink-0 justify-items-center font-serif text-rubric print:text-black">
          <span className="text-[4.5rem] leading-[0.8] tabular-nums md:text-[6rem]">{day}</span>
          <span className="mt-2 text-sm uppercase tracking-[0.2em]">{month}</span>
        </p>
        <div className="min-w-0 pt-1">
          <h1 className="font-serif text-3xl leading-[1.12] text-balance md:text-[2.75rem]">{d.title || "Untitled devotional"}</h1>
          {meter.length ? (
            <p className="mt-2 font-serif italic text-muted">
              {meter.map((part, i) => (
                <Fragment key={part}>
                  {i > 0 ? " · " : ""}
                  <span className="whitespace-nowrap">{part}</span>
                </Fragment>
              ))}
            </p>
          ) : null}
        </div>
      </header>

      {d.daily_topic || theme?.summary || kinds.length ? (
        <aside aria-label="About this day" className="mt-6 max-w-[36rem] font-serif lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:mt-6 lg:self-start lg:border-l lg:border-line lg:pl-6">
          {d.daily_topic ? <p className="text-xl leading-snug">{d.daily_topic}</p> : null}
          {theme?.summary ? <p className="mt-2 text-muted">{theme.summary}</p> : null}
          {kinds.length ? <p className="mt-2 text-sm italic text-muted">{kinds.join(" · ")}</p> : null}
        </aside>
      ) : null}

      {actions ? <div className="mt-6 print:hidden lg:col-start-1">{actions}</div> : null}

      <div className="lg:col-start-1">
      <ol className="mt-10 border-t-4 border-double border-ink/70 print:mt-6">
        <Part n={0} id="scripture" title="Scripture" rubric="Read it aloud together. Announce the reference first.">
          {display.mode === "text" ? (
            <figure>
              <blockquote className="font-serif text-xl leading-relaxed md:text-2xl">
                {display.text.split("\n").map((line, i) => {
                  const verse = /^(\d{1,3})\s+(.*)$/.exec(line);
                  return (
                    <span key={i} className={i === 0 ? "block" : "mt-1.5 block"}>
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
              <figcaption className="mt-4 font-serif text-sm italic text-muted">
                {/* The attribution usually names the translation already; don't say it twice. */}
                {[d.scripture_reference, translation && display.attribution?.includes(translation.name) ? null : translationLabel].filter(Boolean).join(" · ")}
                {display.attribution ? <span className="block">{display.attribution}</span> : null}
              </figcaption>
            </figure>
          ) : (
            <div className="font-serif">
              <p className="text-2xl md:text-3xl">{d.scripture_reference || "No passage chosen"}</p>
              {translationLabel ? <p className="mt-1 text-sm italic text-muted">{translationLabel}</p> : null}
              {d.scripture_reference ? (
                <p className="mt-4 max-w-[36rem] text-muted">
                  This translation’s text is not reproduced here. Read the passage in your own Bible
                  <span className="print:hidden">
                    , or{" "}
                    <a
                      href={passageLookupUrl(d.scripture_reference, d.translation_code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-rubric underline decoration-rubric/40 underline-offset-4 hover:decoration-rubric"
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
        <Part n={1} id="reflection" title="Reflection" rubric="Read it yourself first; it is written at your students’ level.">
          <Rich doc={d.reflection} />
        </Part>
        <Part n={2} id="think" title="A question to talk about" rubric="Let the room answer before you do.">
          <Rich doc={d.discussion_question} large />
        </Part>
        <Part n={3} id="practice" title="Put it into practice" rubric="One small thing to try today.">
          <Rich doc={d.practical_application} />
        </Part>
        <Part n={4} id="prayer" title="Closing prayer" rubric="Pray it together, or invite a student to read it.">
          <Rich doc={d.prayer} />
        </Part>
      </ol>

      {colophon.length ? (
        <p className="mt-8 font-serif text-sm italic text-muted">{colophon.join(" · ")}</p>
      ) : null}
      </div>
      </div>
      <p className="mt-6 hidden font-serif print:block">{SITE.name}</p>
    </article>
  );
}

/** One part of the day: a red numeral, its title, a red italic rubric, then the text. Closed by a hairline. */
function Part({ n, id, title, rubric, children }: { n: number; id: string; title: string; rubric: string; children: ReactNode }) {
  return (
    <li id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-24 grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-3 break-inside-avoid border-b border-line py-7 md:grid-cols-[3.5rem_minmax(0,1fr)] print:py-4">
      <span aria-hidden="true" className="font-serif text-xl text-rubric md:text-2xl print:text-black">{ROMAN[n]}</span>
      <section className="min-w-0">
        <h2 id={`${id}-title`} className="font-serif text-xl md:text-2xl">{title}</h2>
        <p className="mt-1 font-serif italic text-rubric print:hidden">{rubric}</p>
        <div className="mt-4">{children}</div>
      </section>
    </li>
  );
}

function Rich({ doc, large = false }: { doc: DevotionalRecord["reflection"]; large?: boolean }) {
  if (doc.content.length === 0) return <p className="font-serif italic text-muted">Not written yet.</p>;
  return <RichTextView doc={doc} className={`max-w-[36rem] font-serif ${large ? "text-2xl leading-snug text-balance" : "text-lg"}`} />;
}
