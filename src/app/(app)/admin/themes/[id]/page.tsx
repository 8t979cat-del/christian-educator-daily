import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/content/admin-nav";
import { StatusBadge } from "@/components/content/status-badge";
import { ThemeForm, ThemePublishPanel } from "@/components/forms/theme-forms";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { deleteThemeAction } from "@/app/actions/content";
import { uuidSchema } from "@/lib/auth/schemas";
import { requirePlatformRole } from "@/lib/auth/session";
import { addDays, formatDate } from "@/lib/content/dates";
import { getTheme } from "@/lib/content/queries";
import { getSiteTimeZone } from "@/lib/env";

export const metadata: Metadata = { title: "Weekly theme" };
export const dynamic = "force-dynamic";

export default async function ThemePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const { id } = await params;
  const { notice } = await searchParams;
  if (!uuidSchema.safeParse(id).success) notFound();
  const found = await getTheme(id);
  if (!found) notFound();
  const { theme, devotionals } = found;

  const days = [0, 1, 2, 3, 4].map((n) => {
    const date = addDays(theme.week_start, n);
    return { date, devotional: devotionals.find((d) => d.devotional_date === date) };
  });
  const ready = days.every((d) => d.devotional?.status === "approved");
  const anyScheduled = days.some((d) => d.devotional?.status === "scheduled");
  const allDone = days.every((d) => d.devotional && ["scheduled", "published"].includes(d.devotional.status));
  const deletable = devotionals.length === 0 && !theme.published_at;

  return (
    <>
      <PageHeader title={theme.title} description={`Week of ${formatDate(theme.week_start)}`} />
      <AdminNav current="/admin/themes" />
      <NoticeBanner code={notice} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <section aria-labelledby="days-heading" className="grid gap-4">
          <h2 id="days-heading" className="font-serif text-2xl font-semibold">Five devotionals</h2>
          <ol className="grid gap-3">
            {days.map(({ date, devotional }) => (
              <li key={date} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-brand">{formatDate(date)}</p>
                  {devotional ? (
                    <Link href={`/admin/devotionals/${devotional.id}`} className="font-serif text-lg font-semibold underline-offset-2 hover:underline">
                      {devotional.title || "Untitled devotional"}
                    </Link>
                  ) : (
                    <p className="text-muted">Not written yet</p>
                  )}
                </div>
                {devotional ? (
                  <StatusBadge status={devotional.status} />
                ) : (
                  <ButtonLink href={`/admin/devotionals/new?theme=${theme.id}&date=${date}`} variant="secondary">
                    Add devotional
                  </ButtonLink>
                )}
              </li>
            ))}
          </ol>

          <Card padding="lg" className="mt-2">
            <Heading level={2} size={4} className="mb-2">Publish the week</Heading>
            {allDone && !anyScheduled ? (
              <Text size="sm" muted>All five devotionals are live.</Text>
            ) : (
              <ThemePublishPanel themeId={theme.id} ready={ready} anyScheduled={anyScheduled} timeZone={getSiteTimeZone()} />
            )}
          </Card>
        </section>

        <div className="grid gap-6">
          <Card padding="lg">
            <Heading level={2} size={4} className="mb-4">Theme details</Heading>
            <ThemeForm initial={theme} />
          </Card>
          {deletable ? (
            <Card padding="lg" className="border-danger/40">
              <Heading level={2} size={4}>Delete theme</Heading>
              <Text size="sm" muted className="mt-1">Possible only while it has no devotionals.</Text>
              <form action={deleteThemeAction} className="mt-3">
                <input type="hidden" name="id" value={theme.id} />
                <Button type="submit" variant="danger">Delete theme</Button>
              </form>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
