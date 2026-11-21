import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/content/admin-nav";
import { ThemeForm } from "@/components/forms/theme-forms";
import { PageHeader } from "@/components/layout/container";
import { NoticeBanner } from "@/components/layout/notice-banner";
import { Card } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { Heading } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { addDays, formatDate } from "@/lib/content/dates";
import { categoryName } from "@/lib/content/options";
import { listThemeStatuses, listThemes } from "@/lib/content/queries";

export const metadata: Metadata = { title: "Weekly themes" };
export const dynamic = "force-dynamic";

export default async function ThemesPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const { notice } = await searchParams;
  const [themes, statuses] = await Promise.all([listThemes(), listThemeStatuses()]);
  const summary = (id: string) => {
    const mine = statuses.filter((s) => s.theme_id === id);
    const approved = mine.filter((s) => ["approved", "scheduled", "published"].includes(s.status)).length;
    const live = mine.filter((s) => s.status === "published").length;
    return { total: mine.length, approved, live, scheduled: mine.filter((s) => s.status === "scheduled").length };
  };

  return (
    <>
      <PageHeader title="Weekly themes" description="A theme groups five devotionals, Monday to Friday, that can be published together." />
      <AdminNav current="/admin/themes" />
      <NoticeBanner code={notice} />

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-start">
        <section aria-labelledby="themes-heading">
          <h2 id="themes-heading" className="sr-only">All themes</h2>
          {themes.length === 0 ? (
            <EmptyState icon="calendar" title="No weekly themes yet" description="Create a theme for a week, then add its five devotionals." />
          ) : (
            <ul className="grid gap-3">
              {themes.map((theme) => {
                const s = summary(theme.id);
                return (
                  <li key={theme.id}>
                    <Link href={`/admin/themes/${theme.id}`} className="block rounded-card border border-line bg-surface p-5 hover:border-brand hover:bg-brand-soft/40">
                      <p className="text-sm font-semibold text-brand">
                        {formatDate(theme.week_start, "short")} to {formatDate(addDays(theme.week_start, 4), "short")}
                      </p>
                      <h3 className="mt-1 font-serif text-xl font-normal">{theme.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                        {theme.category_slug ? <Badge>{categoryName(theme.category_slug)}</Badge> : null}
                        <span>{s.total} of 5 written</span>
                        <span>· {s.approved} approved</span>
                        {s.live > 0 ? <span>· {s.live} live</span> : null}
                        {s.scheduled > 0 ? <span>· {s.scheduled} scheduled</span> : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Card padding="lg">
          <Heading level={2} size={4} className="mb-4">New theme</Heading>
          <ThemeForm />
        </Card>
      </div>
    </>
  );
}
