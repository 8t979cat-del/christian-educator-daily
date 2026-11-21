import { Container } from "@/components/layout/container";
import { ClassroomPreview } from "@/components/marketing/classroom-preview";
import { SameDayEveryAge } from "@/components/marketing/same-day-every-age";
import { SchoolYear } from "@/components/marketing/school-year";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Heading, Text } from "@/components/ui/typography";
import { getFoundingContactEmail } from "@/lib/env";

/** The five slides of a typical day, in the order a class sees them. */
const DAY = [
  { name: "The day’s title", detail: "With the week’s theme beneath it." },
  { name: "Scripture", detail: "The whole passage, with the reference first, so you can read it aloud together." },
  { name: "Reflection", detail: "A short reading, written at your students’ level." },
  { name: "A question to talk about", detail: "One question, large enough to discuss from anywhere in the room." },
  { name: "Practice and prayer", detail: "One small thing to try today, and a closing prayer." },
] as const;

const CLASSROOM = [
  "Opens full screen; arrow keys or a presentation clicker move it on.",
  "Choose your students’ reading level once. It is remembered on that computer.",
  "Most days fit on five slides, with Scripture large enough to read from the back row.",
  "A presenter window keeps your notes on your laptop, off the projector.",
  "Made for projectors, shared laptops and Chromebooks.",
] as const;

const TRUST = [
  { title: "No student accounts", body: "Students only see what you put on the screen. They never sign up or sign in." },
  { title: "No advertising", body: "Nothing is sold to your teachers or your students, and nothing is shown to them but the devotional." },
  { title: "Your school’s information stays yours", body: "Each school’s accounts and records are kept private from every other school." },
] as const;

export default function LandingPage() {
  const contact = getFoundingContactEmail();
  const contactHref = contact
    ? `mailto:${contact}?subject=${encodeURIComponent("Founding school: Everyday Devotional")}`
    : "#founding";

  return (
    <>
      <section className="border-b border-line">
        <Container className="py-14 md:py-20">
          <div className="max-w-3xl">
            <Heading level={1} className="hyphens-auto">
              A devotional for every school day, written for every age in your school
            </Heading>
            <Text size="lg" muted className="mt-5 max-w-2xl">
              Everyday Devotional gives each teacher 180 days of classroom devotionals. Every day shares one Scripture
              passage, written at four reading levels from kindergarten to grade 12, and opens on the classroom screen in
              about a minute.
            </Text>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={contactHref} size="lg">
                Become a founding school
              </ButtonLink>
              <ButtonLink href="/classroom-demo" variant="secondary" size="lg">
                Try classroom mode
              </ButtonLink>
            </div>
            <Text size="sm" muted className="mt-4">
              We are inviting a small group of Christian schools to be the first to use it, free, and to help shape it.
            </Text>
          </div>
          <div className="mt-12 md:mt-16">
            <SameDayEveryAge />
          </div>
        </Container>
      </section>

      <section id="year" className="scroll-mt-20 py-16 md:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <Heading level={2}>180 days, in the order your year runs</Heading>
              <Text muted className="mt-4 max-w-xl">
                Thirty-six weeks, Monday to Friday. Each week follows one theme, such as patience or courage, so a
                class can stay with an idea for five days instead of starting over every morning.
              </Text>
              <div className="mt-8">
                <SchoolYear />
              </div>
            </div>
            <div>
              <Heading level={3}>What a day looks like</Heading>
              <ol className="mt-5 grid gap-0 border-t border-line">
                {DAY.map((step, i) => (
                  <li key={step.name} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 border-b border-line py-4">
                    <span className="font-serif text-2xl font-semibold leading-none text-brand tabular-nums" aria-hidden="true">{i + 1}</span>
                    <div>
                      <p className="font-semibold">{step.name}</p>
                      <p className="mt-1 text-pretty text-muted">{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Container>
      </section>

      <section id="classroom" className="scroll-mt-20 bg-surface py-16 md:py-24">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <Heading level={2}>Open the day in about a minute</Heading>
            <Text muted className="mt-4">
              Open today’s devotional, choose Present to class, and lead it from the front of the room.
            </Text>
            <ul className="mt-6 grid gap-3">
              {CLASSROOM.map((point) => (
                <li key={point} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
                  <Icon name="check" size={20} className="mt-0.5 text-brand" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <ButtonLink href="/classroom-demo" variant="secondary" className="mt-8">
              Try it with a sample devotional
            </ButtonLink>
          </div>
          <ClassroomPreview />
        </Container>
      </section>

      <section className="py-16 md:py-24">
        <Container>
          <Heading level={2} className="max-w-2xl">Made for a school’s trust</Heading>
          <dl className="mt-8 grid gap-8 md:grid-cols-3">
            {TRUST.map((item) => (
              <div key={item.title} className="border-t-2 border-brand pt-4">
                <dt className="font-serif text-xl font-semibold">{item.title}</dt>
                <dd className="mt-2 text-pretty text-muted">{item.body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section id="founding" className="on-dark scroll-mt-20 bg-night py-16 text-parchment md:py-24">
        <Container>
          <div className="max-w-3xl">
            <Heading level={2}>Become a founding school</Heading>
            <Text size="lg" className="mt-4 text-[#c9d3dc]">
              The first devotionals are being written and theologically reviewed now. Founding schools use them first, in
              real classrooms, and tell us what works.
            </Text>
          </div>
          <div className="mt-10 grid gap-10 md:grid-cols-2">
            <div>
              <Heading level={3} size={4} className="text-mint">What your school receives</Heading>
              <ul className="mt-4 grid gap-3">
                <li>A school licence for the pilot dates, free of charge.</li>
                <li>Teacher accounts, handed out with your own access code.</li>
                <li>A 30-minute orientation call for your administrators.</li>
                <li>Each devotional as soon as it has been written and reviewed.</li>
              </ul>
            </div>
            <div>
              <Heading level={3} size={4} className="text-mint">What we ask</Heading>
              <ul className="mt-4 grid gap-3">
                <li>Teachers answer a short survey in the app, about three minutes.</li>
                <li>One conversation with an administrator, about 30 to 40 minutes.</li>
                <li>Honest feedback, including “not yet” if that is the answer.</li>
              </ul>
            </div>
          </div>
          <div className="mt-10">
            {contact ? (
              <>
                <ButtonLink href={contactHref} size="lg" className="bg-mint text-night hover:bg-[#a6dbd2]">
                  Write to us about your school
                </ButtonLink>
                <p className="mt-3 text-sm text-[#c9d3dc]">
                  Opens an email to <span className="font-semibold text-parchment">{contact}</span>.
                </p>
              </>
            ) : (
              <p className="text-[#c9d3dc]">Founding places are by invitation. Ask the person who shared this page with you.</p>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
