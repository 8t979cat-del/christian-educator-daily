import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { CovenantAcceptForm } from "@/components/governance/forms";
import { COVENANT, COVENANT_INTRO, PRAYER_REMINDER } from "@/lib/community/covenant";
import { covenantStatus } from "@/lib/governance/queries";

export const metadata: Metadata = { title: "Community covenant" };

export default async function CovenantPage() {
  const status = await covenantStatus();
  return (
    <>
      <PageHeader title="Community covenant" description={COVENANT_INTRO} />
      <ol className="grid max-w-3xl gap-4">
        {COVENANT.map((item, i) => (
          <li key={item.title}>
            <Card as="article">
              <Heading level={2} size={4}>{i + 1}. {item.title}</Heading>
              <Text className="mt-2">{item.body}</Text>
            </Card>
          </li>
        ))}
      </ol>
      <section aria-label="Prayer and privacy" className="mt-6 max-w-3xl">
        <Card as="article">
          <Heading level={2} size={4}>A note on prayer and privacy</Heading>
          <Text className="mt-2">{PRAYER_REMINDER}</Text>
          <Text className="mt-2">Prayers are never ranked or counted for display beyond a plain “people have prayed” line, and what you keep private stays private: it is not visible to moderators, school administrators or other members.</Text>
        </Card>
      </section>
      {status.required ? (
        <section aria-label="Accept the covenant" className="mt-6 max-w-3xl">
          <CovenantAcceptForm version={status.version} accepted={status.accepted} />
        </section>
      ) : null}
      <Card tone="soft" className="mt-8 max-w-3xl">
        <Heading level={2} size={4}>How moderation works</Heading>
        <ul className="mt-3 grid list-disc gap-2 pl-5">
          <li>Anyone can report conduct. Reports are read by people, not machines, and the person reported is never told who reported.</li>
          <li>Respectful disagreement, including about doctrine and denomination, is not misconduct. Reports about convictions are dismissed.</li>
          <li>Moderators hide rather than delete, and always tell the author why. A hidden contribution can be restored.</li>
          <li>You can appeal any moderation decision within 30 days. A different moderator reviews it.</li>
          <li>Serious concerns, such as a credible threat or someone at risk, can be marked urgent when reporting. They move to the top of the queue and go straight to platform staff, even from a private group. The queue is read by people during working hours and is not a 24-hour service: if someone is in immediate danger, contact your local emergency services first.</li>
          <li>Moderators see only what they need to review a report: the reported words, the reason, and the author&apos;s recent moderation record. They do not see private prayers or anything you have not shared.</li>
          <li>Group leaders handle their own group's reports first. Platform staff do not read private group content unless a report is escalated to them.</li>
        </ul>
        <Text size="sm" className="mt-4"><Link className="text-brand underline" href="/community">Back to Community</Link></Text>
      </Card>
    </>
  );
}
