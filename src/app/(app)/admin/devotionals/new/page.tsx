import type { Metadata } from "next";
import { AdminNav } from "@/components/content/admin-nav";
import { DevotionalForm } from "@/components/forms/devotional-form";
import { PageHeader } from "@/components/layout/container";
import { isValidIsoDate, todayIn } from "@/lib/content/dates";
import { listThemes, listTranslations } from "@/lib/content/queries";
import { requirePlatformRole } from "@/lib/auth/session";
import { getSiteTimeZone } from "@/lib/env";

export const metadata: Metadata = { title: "New devotional" };
export const dynamic = "force-dynamic";

export default async function NewDevotionalPage({ searchParams }: { searchParams: Promise<{ theme?: string; date?: string }> }) {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const sp = await searchParams;
  const [translations, themes] = await Promise.all([listTranslations(), listThemes()]);
  const themeId = themes.some((t) => t.id === sp.theme) ? sp.theme : undefined;
  const date = sp.date && isValidIsoDate(sp.date) ? sp.date : todayIn(getSiteTimeZone());

  return (
    <>
      <PageHeader title="New devotional" description="Saved as a draft. It is never published from this page." />
      <AdminNav current="/admin/devotionals" />
      <DevotionalForm
        initial={{ devotional_date: date, ...(themeId ? { theme_id: themeId } : {}) }}
        translations={translations}
        themes={themes}
      />
    </>
  );
}
