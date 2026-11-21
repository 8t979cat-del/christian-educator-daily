import { COMMUNITY_ENABLED } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/content/admin-nav";
import { ActionForm } from "@/components/forms/action-form";
import { TextAreaField } from "@/components/ui/form";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { attestAction, retractAttestationAction, setFlagAction } from "@/app/actions/launch";
import { COMMUNITY_FLAGS, OTHER_FLAGS } from "@/lib/launch/flags";
import { requirePlatformRole } from "@/lib/auth/session";
import { communitySettings } from "@/lib/community/queries";
import { checkEnvironment } from "@/lib/ops/env-check";
import { communityReadiness, contentReadiness } from "@/lib/launch/queries";

export const metadata: Metadata = { title: "Launch readiness" };
export const dynamic = "force-dynamic";

const FLAG_LABEL: Record<string, { name: string; help: string }> = {
  public_discussions_enabled: { name: "Public devotional discussions", help: "Reflections, questions and encouragement on approved devotionals." },
  prayer_contributions_enabled: { name: "Prayer contributions", help: "Sharing a prayer request on a devotional." },
  prayer_acknowledgements_enabled: { name: "Prayer acknowledgements", help: "\"I prayed\" on someone's request." },
  groups_enabled: { name: "Private educator groups", help: "Master switch. Existing groups stay readable when it is off." },
  group_creation_enabled: { name: "Creating groups", help: "Starting a new group." },
  group_posting_enabled: { name: "Group posts and comments", help: "Writing inside a group." },
  group_invitations_enabled: { name: "Group invitations", help: "Inviting people into a group." },
  school_administration_enabled: { name: "School administration (self-service)", help: "Educators creating and running a school. Pilot schools are set up by staff either way." },
  paid_subscriptions_enabled: { name: "Paid subscriptions", help: "Opens the checkout page. Needs live Stripe credentials, which are added only after explicit approval." },
};

function Row({ ok, label, detail, tag }: { ok: boolean; label: string; detail: string; tag?: string }) {
  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-line py-3 last:border-0">
      <Badge>{ok ? "Done" : "Not yet"}</Badge>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}{tag ? <span className="ml-2 text-sm text-muted">({tag})</span> : null}</p>
        <p className="text-sm text-muted">{detail}</p>
      </div>
    </li>
  );
}

export default async function LaunchPage() {
  await requirePlatformRole(["platform_admin"]);
  const [community, content, flags] = await Promise.all([communityReadiness(), contentReadiness(), communitySettings()]);
  // Names and verdicts only. Values are never read into the page.
  const env = checkEnvironment(process.env);
  const ready = community.filter((r) => r.kind !== "advisory").every((r) => r.ok);
  const contentBlocked = content.filter((r) => r.blocking && !r.ok).length;

  return (
    <>
      <PageHeader title="Launch readiness" description="Everything that must be true before people can take part. Nothing here is switched on for you." />
      <AdminNav current="/admin/launch" />

      <Alert tone={ready ? "success" : "info"} className="mb-6">
        {ready
          ? "Community safety readiness is complete. Interactive features can be switched on, one at a time."
          : "Community safety readiness is not complete, so every interactive feature stays closed. Direct messaging is not part of this release and cannot be switched on."}
      </Alert>

      <div className="grid gap-6">
        <Card>
          <Heading level={2} size={3}>Community safety</Heading>
          <Text size="sm" muted>Automatic items are read from the system. Sign-offs are a person stating what was done; they are recorded with who and when.</Text>
          <ul className="mt-3">
            {community.map((r) => (
              <li key={r.key} className="border-b border-line py-3 last:border-0">
                <Row ok={r.ok} label={r.label} detail={r.detail} tag={r.kind === "advisory" ? "advisory" : r.kind === "signoff" ? "sign-off" : undefined} />
                {r.kind === "signoff" ? (
                  <div className="ml-1 mt-1">
                    {r.ok ? (
                      <ActionForm action={retractAttestationAction} submit="Withdraw sign-off" variant="secondary" className="flex items-center gap-3"><input type="hidden" name="key" value={r.key} /></ActionForm>
                    ) : (
                      <ActionForm action={attestAction} submit="Record sign-off">
                        <input type="hidden" name="key" value={r.key} />
                        <TextAreaField label="What was done, and by whom" name="note" rows={2} required minLength={10} maxLength={600} />
                      </ActionForm>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <Heading level={2} size={3}>Content</Heading>
          <Text size="sm" muted>{contentBlocked === 0 ? "No blocking content items." : `${contentBlocked} blocking item(s) to resolve before launch.`}</Text>
          <ul className="mt-3">
            {content.map((r) => <Row key={r.key} ok={r.ok} label={r.label} detail={r.detail} tag={r.blocking ? undefined : "advisory"} />)}
          </ul>
          {content.length === 0 ? <Text size="sm" muted>Content readiness could not be read.</Text> : null}
          <p className="mt-3 text-sm">Scripture licences are recorded on <Link className="underline" href="/admin/translations">Translations</Link>.</p>
        </Card>

        <Card>
          <Heading level={2} size={3}>Feature switches</Heading>
          <Text size="sm" muted>Each switch is independent. Switching off is always allowed and takes effect immediately; nothing is deleted.</Text>
          <ul className="mt-3">
            {[...COMMUNITY_FLAGS, ...OTHER_FLAGS].map((k) => {
              const on = flags[k] === true;
              const info = FLAG_LABEL[k]!;
              return (
                <li key={k} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{info.name} <Badge>{on ? "On" : "Off"}</Badge></p>
                    <p className="text-sm text-muted">{info.help}</p>
                  </div>
                  <ActionForm action={setFlagAction} submit={on ? "Switch off" : "Switch on"} variant={on ? "secondary" : "primary"} className="flex items-center gap-3">
                    <input type="hidden" name="key" value={k} />
                    <input type="hidden" name="value" value={on ? "false" : "true"} />
                  </ActionForm>
                </li>
              );
            })}
            <li className="flex items-center gap-3 py-3">
              <div className="flex-1"><p className="font-medium">Direct messaging <Badge>Off</Badge></p><p className="text-sm text-muted">Not available in this release. The database refuses to enable it.</p></div>
            </li>
          </ul>
        </Card>

        <Card>
          <Heading level={2} size={3}>This deployment&rsquo;s configuration</Heading>
          <Text size="sm" muted>Environment: <strong>{env.environment}</strong>. Names and verdicts only; no value is ever shown.</Text>
          <ul className="mt-3">
            {env.checks.filter((c) => c.level !== "ok").map((c) => <Row key={c.key + c.message} ok={false} label={c.key} detail={`${c.level}: ${c.message}`} />)}
          </ul>
          {env.errors + env.warnings === 0 ? <Text size="sm">No problems found.</Text> : null}
        </Card>

        <Text size="sm" muted>
          Next: <Link className="underline" href="/admin/pilot">founding-school pilot</Link> · <Link className="underline" href="/admin/feedback">feedback</Link>{COMMUNITY_ENABLED ? <> · <Link className="underline" href="/community/moderation">moderation</Link></> : null}
        </Text>
      </div>
    </>
  );
}
