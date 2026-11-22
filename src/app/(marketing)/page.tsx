import Link from "next/link";
import { Container } from "@/components/layout/container";
import { SameDayEveryAge } from "@/components/marketing/same-day-every-age";
import { SchoolWeek } from "@/components/marketing/school-year";
import { InlinePresenter } from "@/components/present/inline-presenter";
import { ButtonLink, buttonStyles } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatDate, todayIn } from "@/lib/content/dates";
import { getPublicToday } from "@/lib/content/queries";
import { getFoundingContactEmail, getSiteTimeZone } from "@/lib/env";

// Today's devotional changes daily and comes from the database on each visit.
export const dynamic = "force-dynamic";

/** Every devotional is the same four-step lesson, so a class always knows what comes next. */
const STEPS: Array<{ name: string; icon: IconName; body: string }> = [
  { name: "Read", icon: "book", body: "The class reads the passage together, then a short reflection written at their reading level." },
  { name: "Talk", icon: "chat", body: "One open question. Let the room answer before you do." },
  { name: "Do", icon: "target", body: "One small, concrete thing to try today." },
  { name: "Pray", icon: "pray", body: "A short closing prayer to pray together, or for a student to read." },
];

const POINTS = [
  "Ready to present in about a minute, with no preparation",
  "Written at four reading levels, kindergarten to grade 12",
  "No student accounts and no advertising",
] as const;

const TRUST = [
  { title: "No student accounts", body: "Students only see what you put on the screen. They never sign up or sign in." },
  { title: "No advertising", body: "Nothing is sold to your teachers or your students, and nothing is shown to them but the devotional." },
  { title: "Your school’s information stays yours", body: "Each school’s accounts and records are kept private from every other school." },
] as const;

export default async function LandingPage() {
  const contact = getFoundingContactEmail();
  const iso = todayIn(getSiteTimeZone());
  const today = await getPublicToday(iso);
  const contactHref = contact
    ? `mailto:${contact}?subject=${encodeURIComponent("Founding school: Everyday Devotional")}`
    : "#founding";
  // "Day 3 of 5" → 3: which day of this week's theme today is, for the progress dots.
  const weekDay = Number(/Day (\d)/.exec(today?.theme?.dayLabel ?? "")?.[1] ?? 0);

  return (
    <>
      {/* Today's lesson: the workbook page for the day, ready to present. */}
      <section aria-labelledby="today-title" className="py-8 md:py-12">
        <Container className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8">
          <article id="today-lesson" className="workbook-paper min-w-0 overflow-hidden rounded-card border border-line shadow-card">
            {/* Written on the rules: every line here is 2rem (titles 2rem on phones, 4rem on wide screens). */}
            <div className="px-5 pt-8 sm:pl-16 sm:pr-8">
              <div className="flex min-h-8 flex-wrap items-center gap-x-4 text-sm leading-8">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-soft px-3 font-semibold leading-none text-brand">
                  <Icon name="sun" size={16} /> {today ? "Today" : formatDate(iso)}
                </span>
                {today?.theme ? (
                  <span className="flex flex-wrap items-center gap-x-2 text-muted">
                    <span>This week: <span className="font-semibold text-ink">{today.theme.title}</span></span>
                    {weekDay ? (
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <span key={n} className={`size-2.5 rounded-full ${n < weekDay ? "bg-gilt" : n === weekDay ? "bg-brand ring-2 ring-brand/25" : "bg-line"}`} />
                          ))}
                        </span>
                        <span className="whitespace-nowrap">{today.theme.dayLabel}</span>
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>

              <h1 id="today-title" className="font-serif text-[1.75rem] font-semibold leading-8 tracking-[-0.01em] text-balance md:-mr-8 md:pr-8 md:text-[2.75rem] md:leading-[4rem] md:title-lines">
                {today ? today.title : "A devotional for every school day, written for every age"}
              </h1>
              {today ? (
                <p className="leading-8 text-muted">
                  {[today.scripture.reference, today.topic].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>

            {/* The presenter is pasted onto the page: its own panel, clear of the ruling. */}
            <div className="ml-[calc(var(--wb-margin)+1.5px)] mt-8 bg-surface pb-6 pl-[calc(1.25rem-var(--wb-margin)-1.5px)] pr-5 pt-1 sm:pl-[calc(4rem-var(--wb-margin)-1.5px)] sm:pr-8 md:pb-8">
              {today ? (
                <InlinePresenter content={today} />
              ) : (
                <div className="rounded-card border border-line bg-surface p-6 md:p-10">
                  <p className="font-serif text-2xl leading-snug">Today’s devotional appears here each school day.</p>
                  <p className="mt-3 max-w-xl text-muted">
                    Open this page in the morning and present it to your class, with no sign-in. Until the first devotionals
                    are published, try classroom mode with a sample.
                  </p>
                  <ButtonLink href="/classroom-demo" className="mt-6">Try classroom mode</ButtonLink>
                </div>
              )}
            </div>
          </article>

          <aside aria-labelledby="why-title" className="grid content-start gap-5 rounded-card border border-line bg-surface p-6 shadow-card">
            <h2 id="why-title" className="text-lg font-semibold leading-snug">A short devotional for every school day</h2>
            <ul className="grid gap-3">
              {POINTS.map((p) => (
                <li key={p} className="flex gap-3">
                  <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-ink">
                    <Icon name="check" size={15} />
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              {today
                ? "Choose Present full screen, then move on with the arrow keys or a clicker."
                : "Each morning, the day’s devotional opens here, ready for the projector."}
            </p>
            <div className="grid gap-2 border-t border-line pt-5">
              <p className="text-sm text-muted">For school leaders</p>
              <a href={contactHref} className={buttonStyles({ variant: "secondary", fullWidth: true })}>
                Become a founding school
              </a>
            </div>
          </aside>
        </Container>
      </section>

      <section id="year" aria-labelledby="steps-title" className="scroll-mt-20 border-t border-line bg-surface py-14 md:py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 id="steps-title" className="font-serif text-3xl font-semibold leading-tight md:text-[2.4rem]">Every day is the same four-step lesson</h2>
            <p className="mt-4 text-lg text-muted">
              A class quickly learns the rhythm, so the devotional runs itself: read, talk, do, pray. It takes about ten minutes.
            </p>
          </div>
          {/* A connected path of four steps, like a lesson's progress through a unit. */}
          <ol className="relative mt-12 grid gap-8 md:grid-cols-4 md:gap-6">
            <span aria-hidden="true" className="absolute left-6 top-6 hidden h-0.5 w-[calc(75%+1.5rem)] bg-ruling md:block" />
            {STEPS.map((step, i) => (
              <li key={step.name} className="relative grid grid-cols-[3rem_minmax(0,1fr)] gap-4 md:block">
                <span className="relative grid size-12 place-items-center rounded-full border-2 border-brand bg-surface text-brand">
                  <Icon name={step.icon} size={22} />
                  <span className="sr-only">Step {i + 1}: </span>
                </span>
                <div className="md:mt-5">
                  <p className="text-xl font-semibold">{step.name}</p>
                  <p className="mt-1 text-muted">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="classroom" aria-labelledby="levels-title" className="scroll-mt-20 py-14 md:py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 id="levels-title" className="font-serif text-3xl font-semibold leading-tight md:text-[2.4rem]">One passage, written for every age</h2>
            <p className="mt-4 text-lg text-muted">
              Each day keeps one Scripture passage and writes the lesson for four groups: kindergarten to grade 2, 3 to 5,
              6 to 8 and 9 to 12. Signed-in teachers choose their students’ level once.
            </p>
          </div>
          <div className="mt-10">
            <SameDayEveryAge />
          </div>
          <p className="mt-8">
            <Link href="/classroom-demo" className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand hover:underline">
              Try classroom mode with a sample devotional <Icon name="arrow-right" size={18} />
            </Link>
          </p>
        </Container>
      </section>

      <section aria-labelledby="week-title" className="border-y border-line bg-surface py-14 md:py-20">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16">
          <div>
            <h2 id="week-title" className="font-serif text-3xl font-semibold leading-tight md:text-[2.4rem]">A theme for every week, all year round</h2>
            <p className="mt-4 text-lg text-muted">
              Monday to Friday, every week has one theme, so a class lives with an idea for a few days.
            </p>
            {/* Why "180 Days" in the name: it counts a school year; the devotionals keep going all year. */}
            <p className="mt-4 flex gap-3 rounded-card bg-gold-soft p-4 text-ink">
              <Icon name="calendar" size={20} className="mt-1 shrink-0 text-gold-ink" />
              <span>
                A devotional for every weekday, whatever your school’s calendar. Our full name, Everyday Devotional:
                180 Days, counts a school year of about 180 days. But it doesn’t stop there: the devotionals carry on
                through all 52 weeks, so summer school and year-round schools have one each day too.
              </span>
            </p>
          </div>
          <SchoolWeek />
        </Container>
      </section>

      <section aria-labelledby="trust-title" className="py-14 md:py-20">
        <Container className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <h2 id="trust-title" className="font-serif text-3xl font-semibold leading-tight md:text-[2.4rem]">Made for schools</h2>
          <ul className="grid gap-5">
            {TRUST.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span aria-hidden="true" className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-ink">
                  <Icon name="check" size={16} />
                </span>
                <div>
                  <p className="text-lg font-semibold">{item.title}</p>
                  <p className="mt-1 text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section id="founding" aria-labelledby="founding-title" className="scroll-mt-20 border-t border-line bg-surface py-14 md:py-20">
        <Container>
          {/* A sign-up sheet in the workbook: the margin line, gold checks, one blue action. */}
          <div className="workbook-margin rounded-card border border-line px-5 py-8 shadow-card sm:pl-16 sm:pr-10 md:py-12">
            <div className="max-w-3xl">
              <h2 id="founding-title" className="font-serif text-3xl font-semibold leading-tight md:text-[2.6rem]">Become a founding school</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                The first devotionals are being written and theologically reviewed now. Founding schools use them first, in
                real classrooms, and tell us what works.
              </p>
            </div>
            <div className="mt-10 grid max-w-4xl gap-10 md:grid-cols-2">
              {[
                { title: "What your school receives", items: ["A school licence for the pilot dates, free of charge.", "Teacher accounts, handed out with your own access code.", "A 30-minute orientation call for your administrators.", "Each devotional as soon as it has been written and reviewed."] },
                { title: "What we ask", items: ["Teachers answer a short survey in the app, about three minutes.", "One conversation with an administrator, about 30 to 40 minutes.", "Honest feedback, including “not yet” if that is the answer."] },
              ].map((col) => (
                <div key={col.title}>
                  <h3 className="text-lg font-semibold">{col.title}</h3>
                  <ul className="mt-4 grid gap-3">
                    {col.items.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-ink">
                          <Icon name="check" size={15} />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-10 border-t border-line pt-8">
              {contact ? (
                <>
                  <ButtonLink href={contactHref} size="lg">Write to us about your school</ButtonLink>
                  <p className="mt-3 text-sm text-muted">Opens an email to {contact}.</p>
                </>
              ) : (
                <p className="text-muted">Founding places are by invitation. Ask the person who shared this page with you.</p>
              )}
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}




