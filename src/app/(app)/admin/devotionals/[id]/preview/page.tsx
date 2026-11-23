import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DevotionalView } from "@/components/content/devotional-view";
import { StatusBadge } from "@/components/content/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { uuidSchema } from "@/lib/auth/schemas";
import { requirePlatformRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getDevotional, getThemeInfo, getTranslation } from "@/lib/content/queries";

export const metadata: Metadata = { title: "Preview", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const d = await getDevotional(id);
  if (!d) notFound();
  const supabase = await createClient();
  const [translation, theme, photo] = await Promise.all([
    getTranslation(d.translation_code),
    getThemeInfo(d),
    d.author_name ? supabase.rpc("contributor_photo_for", { p_name: d.author_name }) : null,
  ]);

  return (
    <>
      <Alert tone="info" className="mx-auto mb-8 max-w-3xl">
        <span className="flex flex-wrap items-center gap-3">
          <strong>Preview.</strong> This is how readers will see it. Status: <StatusBadge status={d.status} />
          <ButtonLink href={`/admin/devotionals/${id}`} variant="secondary" className="ml-auto">
            Back to editing
          </ButtonLink>
        </span>
      </Alert>
      <DevotionalView devotional={d} translation={translation} theme={theme} authorPhoto={(photo?.data as string | null) ?? null} />
    </>
  );
}
