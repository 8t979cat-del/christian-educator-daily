import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SameDayEveryAge } from "@/components/marketing/same-day-every-age";
import { SchoolYear } from "@/components/marketing/school-year";
import { InlinePresenter } from "@/components/present/inline-presenter";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, todayIn } from "@/lib/content/dates";
import { getPublicToday } from "@/lib/content/queries";
import { getFoundingContactEmail, getSiteTimeZone } from "@/lib/env";

// Today's devotional changes daily and comes from the database on each visit.
export const dynamic = "force-dynamic";

/** The order of the day, with its rubrics: what the class sees, and what the teacher does. */
const ORDER = [
  { name: "The title", rubric: "Read it aloud. The week’s theme sits beneath it." },
  { name: "Scripture", rubric: "The class reads together. The reference comes first, so you can announce it." },
  { name: "Reflection", rubric: "Written at your students’ reading level, from kindergarten to grade 12." },
  { name: "A question", rubric: "Let the room answer before you do." },
  { name: "Practice and prayer", rubric: "One small thing to try today, and a closing prayer." },
] as const;

const ROMAN = ["I", "II", "III", "IV", "V"] as const;

const TRUST = [
  { title: "No student accounts", body: "Students only see what you put on the screen. They never sign up or sign in." },
  { title: "No advertising", body: "Nothing is sold to your teachers or your students, and nothing is shown to them but the devotional." },
  { title: "Your school’s information stays yours", body: "Each school’s accounts and records are kept private from every other school." },
] as const;

const rubricLink = "font-serif text-rubric underline decoration-rubric/40 underline-offset-4 hover:decoration-rubric";

export default async function LandingPage() {
  const contact = getFoundingContactEmail();
  const iso = todayIn(getSiteTimeZone());
  const today = await getPublicToday(iso);
  const contactHref = contact
    ? `mailto:${contact}?subject=${encodeURIComponent("Founding school: Everyday Devotional")}`
    : "#founding";
  // The day of the month, set large in red like a hymn number at the head of the page.
  const dayNumber = Number(iso.slice(8, 10));

  return (
    <>
      {/* The hymnal page for today: number, title, running head, and the devotional itself, ready to present. */}
      <section aria-labelledby="today-title" className="border-b border-line">
        <Container className="py-8 md:py-12">
          <div className="flex items-baseline justify-between gap-4 border-b-4 border-double border-ink/70 pb-2 font-serif text-sm">
            <span className="uppercase tracking-[0.16em] text-muted">Today’s devotional</span>
            <span className="italic text-muted">{formatDate(iso)}</span>
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-12">
            <div className="min-w-0">
              <div className="flex items-start gap-5 md:gap-7">
                <p aria-hidden="true" className="font-serif text-[4.5rem] leading-[0.8] text-rubric tabular-nums md:text-[6rem]">{dayNumber}</p>
                <div className="min-w-0 pt-1">
                  <h1 id="today-title" className="font-serif text-3xl leading-[1.12] text-balance md:text-[2.75rem]">
                    {today ? today.title : "A devotional for every school day, written for every age"}
                  </h1>
                  <p className="mt-2 font-serif italic text-muted">
                    {today
                      ? [today.scripture.reference, today.scripture.translationLabel].filter(Boolean).join(" · ")
                      : "Everyday Devotional: 180 Days"}
                  </p>
                </div>
              </div>

              <div className="mt-8">
                {today ? (
                  <InlinePresenter content={today} />
                ) : (
                  <div className="border border-ink/70 px-6 py-10 outline outline-1 outline-offset-[5px] outline-line-strong/50 md:px-10">
                    <p className="font-serif text-2xl leading-snug">Today’s devotional appears here each school day.</p>
                    <p className="mt-3 max-w-xl font-serif text-muted">
                      Open this page in the morning and present it to your class, with no sign-in. Until the first devotionals
                      are published, try classroom mode with a sample.
                    </p>
                    <ButtonLink href="/classroom-demo" className="mt-6 font-serif font-normal">Try classroom mode</ButtonLink>
                  </div>
                )}
              </div>
            </div>

            {/* Margin notes, as a hymnal prints tune and meter beside the hymn. */}
            <aside aria-label="About Everyday Devotional" className="grid content-start gap-5 font-serif lg:border-l lg:border-line lg:pl-8">
              <p className="text-lg leading-snug">
                One devotional for each of the 180 school days, written at four reading levels from kindergarten to grade 12.
              </p>
              <p className="text-sm italic text-rubric">
                {today
                  ? "Choose Present full screen, then move on with the arrow keys or a clicker."
                  : "Each morning, the day’s devotional opens here, ready for the projector."}
              </p>
              <div className="border-t border-line pt-4">
                <p className="text-sm text-muted">For schools</p>
                <a href={contactHref} className={`mt-1 inline-flex min-h-11 items-center text-lg ${rubricLink}`}>
                  Become a founding school
                </a>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      <section id="year" aria-labelledby="order-title" className="scroll-mt-20 py-14 md:py-20">
        <Container className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div>
            <h2 id="order-title" className="font-serif text-3xl leading-tight md:text-[2.5rem]">The order of the day</h2>
            <p className="mt-4 max-w-md font-serif text-muted">
              Every devotional follows the same order, so a class knows what comes next. The red lines are for the teacher.
            </p>
          </div>
          <ol className="border-t-4 border-double border-ink/70">
            {ORDER.map((step, i) => (
              <li key={step.name} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 border-b border-line py-4">
                <span aria-hidden="true" className="font-serif text-xl text-rubric">{ROMAN[i]}</span>
                <div>
                  <p className="font-serif text-xl">{step.name}</p>
                  <p className="mt-1 font-serif italic text-rubric">{step.rubric}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="classroom" aria-labelledby="settings-title" className="scroll-mt-20 border-y border-line bg-surface py-14 md:py-20">
        <Container>
          <div className="max-w-xl">
            <h2 id="settings-title" className="font-serif text-3xl leading-tight md:text-[2.5rem]">One passage, set for every age</h2>
            <p className="mt-4 font-serif text-muted">
              A hymnal sets one hymn for many voices. Each day here keeps one Scripture passage and writes it for four rooms:
              kindergarten to grade 2, 3 to 5, 6 to 8 and 9 to 12. Signed-in teachers choose their students’ level once.
            </p>
          </div>
          <div className="mt-10">
            <SameDayEveryAge />
          </div>
          <p className="mt-8 font-serif">
            <Link href="/classroom-demo" className={rubricLink}>Try classroom mode with a sample devotional</Link>
          </p>
        </Container>
      </section>

      <section aria-labelledby="index-title" className="py-14 md:py-20">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="index-title" className="font-serif text-3xl leading-tight md:text-[2.5rem]">Index of the year</h2>
            <p className="max-w-md font-serif italic text-muted">Thirty-six weeks, Monday to Friday, each week on one theme.</p>
          </div>
          <div className="mt-8 border-t-4 border-double border-ink/70 pt-2">
            <SchoolYear />
          </div>
        </Container>
      </section>

      <section aria-labelledby="trust-title" className="border-t border-line py-14 md:py-20">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <h2 id="trust-title" className="font-serif text-3xl leading-tight md:text-[2.5rem]">A word to schools</h2>
          <ol className="grid gap-6">
            {TRUST.map((item, i) => (
              <li key={item.title} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3">
                <span aria-hidden="true" className="font-serif text-xl text-rubric">{ROMAN[i]}</span>
                <div>
                  <p className="font-serif text-xl">{item.title}</p>
                  <p className="mt-1 font-serif text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* The back cover: bookcloth with gilt rules. */}
      <section id="founding" aria-labelledby="founding-title" className="on-dark scroll-mt-20 bg-brand py-16 text-[#e9e3d2] md:py-24">
        <Container>
          <div className="border-y border-gilt/50 py-10 md:py-14">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="founding-title" className="font-serif text-3xl leading-tight text-gilt md:text-[2.75rem]">Become a founding school</h2>
              <p className="mt-5 font-serif text-lg leading-relaxed">
                The first devotionals are being written and theologically reviewed now. Founding schools use them first, in
                real classrooms, and tell us what works.
              </p>
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-10 font-serif md:grid-cols-2">
              <div>
                <h3 className="text-sm uppercase tracking-[0.16em] text-gilt">What your school receives</h3>
                <ul className="mt-4 grid gap-3">
                  <li>A school licence for the pilot dates, free of charge.</li>
                  <li>Teacher accounts, handed out with your own access code.</li>
                  <li>A 30-minute orientation call for your administrators.</li>
                  <li>Each devotional as soon as it has been written and reviewed.</li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm uppercase tracking-[0.16em] text-gilt">What we ask</h3>
                <ul className="mt-4 grid gap-3">
                  <li>Teachers answer a short survey in the app, about three minutes.</li>
                  <li>One conversation with an administrator, about 30 to 40 minutes.</li>
                  <li>Honest feedback, including “not yet” if that is the answer.</li>
                </ul>
              </div>
            </div>
            <div className="mt-12 text-center font-serif">
              {contact ? (
                <>
                  <ButtonLink href={contactHref} size="lg" className="border-gilt bg-gilt font-serif font-normal text-brand hover:bg-[#e2c57a]">
                    Write to us about your school
                  </ButtonLink>
                  <p className="mt-3 text-sm italic">Opens an email to {contact}.</p>
                </>
              ) : (
                <p className="italic">Founding places are by invitation. Ask the person who shared this page with you.</p>
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
