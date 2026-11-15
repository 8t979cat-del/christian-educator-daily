import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Heading, Text } from "@/components/ui/typography";
import { formatDate } from "@/lib/content/dates";

/**
 * What a person sees at a devotional their plan does not include: its title and reference,
 * why it is locked, and where to go. Never its text, and never a prompt that blocks the page.
 */
export function LockedDevotional({
  title, date, reference, reason, archiveDays,
}: { title: string; date: string; reference: string; reason: "plus" | "archive"; archiveDays: number | null }) {
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <Card padding="lg">
        <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-brand">
          <Icon name="bookmark" size={16} /> {formatDate(date)}
        </p>
        <Heading level={1} size={2} className="mt-2">{title}</Heading>
        {reference ? <p className="mt-2 text-lg font-semibold text-brand">{reference}</p> : null}
        <Text className="mt-5" muted>
          {reason === "plus"
            ? "This devotional is part of Educator Plus."
            : `The free plan includes the last ${archiveDays ?? 30} days of devotionals. Educator Plus opens the full archive.`}
        </Text>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/upgrade?plan=plus&feature=${reason === "plus" ? "premium_devotionals" : "devotional_archive_days"}`} className={buttonStyles()}>See Educator Plus</Link>
          <Link href="/today" className={buttonStyles({ variant: "secondary" })}>Today&apos;s devotional</Link>
        </div>
      </Card>
      <Text size="sm" muted>
        Your saved devotionals, notes and anything you have written are untouched. Today&apos;s devotional, classroom presentation and the community stay free.
      </Text>
    </div>
  );
}
