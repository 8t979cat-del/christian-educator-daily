import type { Metadata } from "next";
import { AdminNav } from "@/components/content/admin-nav";
import { TranslationForm } from "@/components/forms/translation-form";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Heading } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { getSiteTimeZone } from "@/lib/env";
import { formatDateTime } from "@/lib/content/dates";
import { listTranslations } from "@/lib/content/queries";

export const metadata: Metadata = { title: "Translations" };
export const dynamic = "force-dynamic";

const TYPE_LABEL = { public_domain: "Public domain", licensed: "Licensed", reference_only: "Reference only" } as const;

export default async function TranslationsPage() {
  const { platformRoles } = await requirePlatformRole(["content_editor", "platform_admin"]);
  const canEdit = platformRoles.includes("platform_admin");
  const translations = await listTranslations();
  const tz = getSiteTimeZone();

  return (
    <>
      <PageHeader title="Translations" description="Which Bible translations may have their text stored and shown." />
      <AdminNav current="/admin/translations" />

      <Alert tone="info" className="mb-8">
        A translation shows its text only when it is public domain, or when you hold a licence and an administrator has
        recorded it here with the required attribution. Every other translation is reference only: devotionals cite the
        passage and link to it elsewhere. This page records the terms staff enter. It is not legal advice, so confirm
        each translation’s terms with its publisher.
        {canEdit ? "" : " Only platform administrators can change these records."}
      </Alert>

      <ul className="grid gap-4">
        {translations.map((t) => (
          <li key={t.code}>
            <Card padding="lg">
              <div className="flex flex-wrap items-center gap-3">
                <Heading level={2} size={4}>
                  {t.name} <span className="font-sans text-base font-normal text-muted">({t.code.toUpperCase()})</span>
                </Heading>
                <Badge>{TYPE_LABEL[t.license_type]}</Badge>
                <Badge>{t.text_allowed ? "Text shown" : "Reference only"}</Badge>
              </div>
              {t.attribution ? <p className="mt-2 text-sm">Attribution: {t.attribution}</p> : null}
              {t.license_notes ? <p className="mt-1 text-sm text-muted">{t.license_notes}</p> : null}
              {t.license_verified_at ? (
                <p className="mt-1 text-sm text-muted">Last recorded {formatDateTime(t.license_verified_at, tz)}</p>
              ) : null}
              {canEdit ? (
                <details className="mt-4">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand">Edit licence record</summary>
                  <div className="mt-3">
                    <TranslationForm initial={t} />
                  </div>
                </details>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <Card padding="lg" className="mt-8">
          <Heading level={2} size={4} className="mb-4">Add a translation</Heading>
          <TranslationForm />
        </Card>
      ) : null}
    </>
  );
}
