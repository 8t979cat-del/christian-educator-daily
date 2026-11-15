import { Container } from "@/components/layout/container";
import { ClassroomPreview } from "@/components/marketing/classroom-preview";
import { ButtonLink } from "@/components/ui/button";
import { Card, FeatureCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import type { IconName } from "@/components/ui/icon";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";

const PILLARS: Array<{ icon: IconName; title: string; body: string }> = [
  {
    icon: "sun",
    title: "Daily devotionals",
    body: "A theme, Scripture, a short reflection, a prayer, a discussion question and one practical step, written for the realities of school life.",
  },
  {
    icon: "presentation",
    title: "Classroom presentation",
    body: "Full-screen, projector-friendly display with large Scripture text and no distractions, so a devotional can open the school day.",
  },
  {
    icon: "file",
    title: "Teacher resources",
    body: "Weekly faculty devotionals, staff meeting guides and printable materials, organized by topic and by educational role.",
  },
  {
    icon: "users",
    title: "Educator community",
    body: "Private groups for encouragement, discussion and prayer requests, with moderation built in from the start.",
  },
  {
    icon: "building",
    title: "School administration",
    body: "School accounts, faculty membership, shared resources and school-wide devotional assignments in one place.",
  },
  {
    icon: "shield",
    title: "Privacy by design",
    body: "No student accounts and no advertising. Administrators see aggregate engagement, never anyone's prayer requests.",
  },
];

export default function LandingPage() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="grid items-center gap-10 py-14 md:py-20 lg:grid-cols-2">
          <div>
            <Badge>In development: foundation build</Badge>
            <Heading level={1} className="mt-5">
              A quiet place to begin the school day
            </Heading>
            <Text size="lg" muted className="mt-5 max-w-xl">
              Christian Educator Daily is a devotional and school-ministry platform for Christian teachers,
              administrators and schools. Read it alone in the morning, present it to a class, or share it with
              the whole faculty.
            </Text>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg">
                Create your account
              </ButtonLink>
              <ButtonLink href="#pillars" variant="secondary" size="lg">
                See what it offers
              </ButtonLink>
            </div>
            <Text size="sm" muted className="mt-4">
              Accounts and school organizations are available. Daily devotional content has not been written yet, so signed-in pages show empty states.
            </Text>
          </div>
          <ClassroomPreview />
        </Container>
      </section>

      <section id="pillars" className="scroll-mt-20 py-16 md:py-24">
        <Container>
          <Eyebrow>What it offers</Eyebrow>
          <Heading level={2} className="mt-2 max-w-2xl">
            Built around the way Christian educators actually work
          </Heading>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((pillar) => (
              <FeatureCard key={pillar.title} icon={pillar.icon} title={pillar.title}>
                {pillar.body}
              </FeatureCard>
            ))}
          </div>
        </Container>
      </section>

      <section id="classroom" className="scroll-mt-20 bg-surface py-16 md:py-24">
        <Container className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>Classroom mode</Eyebrow>
            <Heading level={2} className="mt-2">
              Open the day in under a minute
            </Heading>
            <Text muted className="mt-4">
              Open today&apos;s devotional, choose Present to Class, and move through Scripture, reflection,
              discussion question and prayer with the arrow keys or a presentation clicker.
            </Text>
            <ul className="mt-6 space-y-3">
              {[
                "Complete Scripture passage in large, high-contrast type",
                "Adjustable text size and a simplified display",
                "Exit with one key press, no leftover interface",
              ].map((point) => (
                <li key={point} className="flex gap-3">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden="true">
                    ✓
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <Card tone="soft" padding="lg">
            <Heading level={3}>Designed for real classrooms</Heading>
            <Text muted className="mt-3">
              Classroom mode is designed for projectors and shared school laptops, including Chromebooks and
              slow school networks. It is part of the first release.
            </Text>
          </Card>
        </Container>
      </section>

      <section id="schools" className="scroll-mt-20 py-16 md:py-24">
        <Container>
          <Card tone="dark" padding="lg" className="md:p-12">
            <Eyebrow className="text-mint">For schools</Eyebrow>
            <Heading level={2} className="mt-2 max-w-2xl">
              One shared rhythm of devotion across your faculty
            </Heading>
            <Text className="mt-4 max-w-2xl text-[#B8C4CF]">
              School accounts let administrators invite faculty, assign a devotional to everyone, and keep
              handouts and meeting guides in one shared library, with each school&apos;s data kept private from
              every other school.
            </Text>
          </Card>
        </Container>
      </section>
    </>
  );
}
