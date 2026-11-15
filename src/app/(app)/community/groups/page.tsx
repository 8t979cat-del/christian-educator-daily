import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { RequestToJoinForm } from "@/components/community/group-forms";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { SearchInput } from "@/components/ui/search-input";
import { Heading, Text } from "@/components/ui/typography";
import { requireAccess } from "@/lib/auth/session";
import { groupDirectory } from "@/lib/community/queries";

export const metadata: Metadata = { title: "Find a group" };
export const dynamic = "force-dynamic";

const PER = 20;

export default async function GroupsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; notice?: string }> }) {
  await requireAccess();
  const { q, page, notice } = await searchParams;
  const p = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const rows = await groupDirectory(q?.slice(0, 80), (p - 1) * PER);

  return (
    <>
      <PageHeader title="Find a group" description="Discoverable groups show only their name and purpose. Posts, prayers and members stay private until you are welcomed in." />
      <NoticeBanner code={notice} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1"><SearchInput action="/community/groups" defaultValue={q} label="Search groups" placeholder="Search groups by name" /></div>
        <Link href="/community/groups/new" className={buttonStyles({ variant: "primary" })}>Start a group</Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="users" title={q ? "No groups match" : "No discoverable groups yet"} description="Private groups are not listed here. If you have been invited to one, open the link you were sent." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rows.map((g) => (
            <li key={g.id}>
              <Card as="article" className="h-full">
                <div className="flex flex-wrap items-center gap-2">
                  <Heading level={2} size={4}>{g.name}</Heading>
                  {g.is_school_group ? <Badge>School</Badge> : null}
                </div>
                {g.description ? <Text size="sm" className="mt-2">{g.description}</Text> : null}
                {g.purpose ? <Text size="sm" muted className="mt-2"><strong className="text-ink">Purpose:</strong> {g.purpose}</Text> : null}
                <div className="mt-4">
                  {g.relationship === "member" ? <Link className="text-brand underline" href={`/community/groups/${g.id}`}>Open group</Link>
                    : g.relationship === "requested" ? <Text size="sm" muted>Your request is waiting for the group&apos;s leaders.</Text>
                    : <RequestToJoinForm groupId={g.id} />}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Pagination" className="mt-6 flex justify-between">
        {p > 1 ? <Link className="text-brand underline" href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p - 1) })}`}>Previous</Link> : <span />}
        {rows.length === PER ? <Link className="text-brand underline" href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p + 1) })}`}>Next</Link> : null}
      </nav>
    </>
  );
}
