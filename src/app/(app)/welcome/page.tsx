import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/container";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { requireAccess } from "@/lib/auth/session";
import { communitySettings } from "@/lib/community/queries";

export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

const Step = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <Card as="section" aria-labelledby={id}>
    <Heading level={2} size={3} id={id}>{title}</Heading>
    <div className="mt-2 grid gap-2">{children}</div>
  </Card>
);

export default async function WelcomePage() {
  await requireAccess();
  const flags = await communitySettings();
  const open = (k: string) => flags[k] === true;
  const anyCommunity = ["public_discussions_enabled", "prayer_contributions_enabled", "groups_enabled"].some(open);

  return (
    <>
      <PageHeader title="Welcome" description="A short tour. Everything here is optional, and you can come back to this page any time." />
      {!anyCommunity ? (
        <Alert tone="info" className="mb-6">
          Discussions, prayer and groups are switched off while the team finishes getting ready for them. Reading and the classroom are fully available. The sections below say what each part will look like.
        </Alert>
      ) : null}
      <div className="grid gap-6">
        <Step id="read" title="1. Read the day’s devotional">
          <Text>Each day has one short devotional: a Scripture passage, a reflection, a prayer, a question to talk about, and a practical idea for the classroom. It is written for teachers, with grade-level labels so you can see where it fits.</Text>
          <p><Link className="underline" href="/today">Open today&rsquo;s devotional</Link></p>
        </Step>
        <Step id="present" title="2. Present it in class">
          <Text>Classroom presentation mode shows the Scripture and the questions in large, calm type for a projector or a screen. It can be driven from the keyboard. Students never need an account.</Text>
        </Step>
        <Step id="reflect" title="3. Scripture-centered reflections">
          <Text>Public discussions are attached to approved Scripture and devotional content. They are a place for reflections, questions and encouragement about that passage. They are not a general feed: there is no ranking, no popularity count, and no way to start a free-standing public post.</Text>
        </Step>
        <Step id="pray" title="4. Prayer contributions and acknowledgements">
          <Text>You may share a prayer request on a devotional, with your name, anonymously, or privately for yourself. Others can quietly acknowledge that they prayed. An acknowledgement is a gentle “I prayed”; it is not a score, and no one sees a leaderboard. Please do not name students or share private details about anyone.</Text>
        </Step>
        <Step id="groups" title="5. Private educator groups">
          <Text>Original posts are allowed only inside authorized private groups, such as a faculty prayer group or a department. Groups are for adult educators, have a purpose and their own guidelines, and are visible only to their members. Groups may be reviewed before they start.</Text>
        </Step>
        <Step id="guidelines" title="6. Community guidelines">
          <Text>Everyone is asked to accept a short covenant before taking part. It asks for kindness, honesty, and care for the people you teach. Anything can be reported, and reports go to human moderators.</Text>
          <p><Link className="underline" href="/community/covenant">Read the covenant</Link></p>
        </Step>
        <Step id="privacy" title="7. Privacy expectations">
          <ul className="list-disc pl-5 text-sm">
            <li>Do not post student names, photos or anything that could identify a student. The platform screens for names, but you are the first safeguard.</li>
            <li>Private prayers are visible only to you. Private group posts are visible only to that group and its moderators.</li>
            <li>Pilot figures are totals. Nobody is ranked, scored or measured on their faith.</li>
            <li>There are no direct messages in this release, and students have no community accounts.</li>
          </ul>
        </Step>
        <Step id="school" title="8. If you lead a school">
          <Text>Your school administrator orientation, in order: (1) send each colleague their access code personally; (2) watch seats in your school page, which fills automatically as people join; (3) decide with your head of school who may start groups; (4) pass along anything you notice to the team through Feedback; (5) read what happens when the pilot ends, which is that access simply ends on its date and nothing is charged.</Text>
          <p><Link className="underline" href="/school">Your school</Link> · <Link className="underline" href="/pilot">Pilot details</Link></p>
        </Step>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/today">Go to today&rsquo;s devotional</ButtonLink>
          <ButtonLink href="/feedback" variant="secondary">Share feedback</ButtonLink>
        </div>
      </div>
    </>
  );
}
