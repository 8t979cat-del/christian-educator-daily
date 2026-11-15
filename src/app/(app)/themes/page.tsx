import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/container";
import { EmptyState } from "@/components/ui/feedback";
import { requireAccess } from "@/lib/auth/session";
import { formatDate } from "@/lib/content/dates";
import { categoryName } from "@/lib/content/options";
import { listThemes } from "@/lib/content/queries";

export const metadata: Metadata = { title: "Weekly themes" };
export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  await requireAccess();
  const themes = await listThemes({ publishedOnly: true });
  return (
    <>
      <PageHeader title="Weekly themes" description="Each week explores one theme across five devotionals." />
      {themes.length === 0 ? (
        <EmptyState icon="calendar" title="No themes yet" description="Published weekly themes will be listed here." />
      ) : (
        <ul className="grid gap-3">
          {themes.map((t) => (
            <li key={t.id}>
              <Link href={`/themes/${t.id}`} className="block rounded-card border border-line bg-surface p-5 hover:border-brand hover:bg-brand-soft/40">
                <p className="text-sm font-semibold text-brand">Week of {formatDate(t.week_start, "short")}{t.category_slug ? ` · ${categoryName(t.category_slug)}` : ""}</p>
                <h2 className="mt-1 font-serif text-xl font-semibold">{t.title}</h2>
                {t.summary ? <p className="mt-1 text-muted">{t.summary}</p> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
