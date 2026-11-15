import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/forms/action-form";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { pilotInterestAction, redeemCodeAction } from "@/app/actions/launch";
import { requireAccess } from "@/lib/auth/session";
import { myPilot } from "@/lib/launch/queries";

export const metadata: Metadata = { title: "Founding-school pilot" };
export const dynamic = "force-dynamic";

const INTEREST_LABEL: Record<string, string> = {
  individual_plus: "I would consider a personal Educator Plus plan",
  school_license: "My school may want a school license",
  need_more_info: "I would like more information",
  not_now: "Not right now",
};

export default async function PilotPage() {
  await requireAccess();
  const pilot = await myPilot();
  const isAdmin = pilot ? ["owner", "admin"].includes(pilot.role) : false;
  const options = Object.entries(INTEREST_LABEL).filter(([k]) => k !== "school_license" || isAdmin).map(([value, label]) => ({ value, label }));
  const ended = pilot ? pilot.status === "closed" || pilot.days_left < 0 : false;

  return (
    <>
      <PageHeader title="Founding-school pilot" description="A small, limited pilot with a few Christian schools." />
      <div className="grid gap-6">
        {pilot ? (
          <Card>
            <Heading level={2} size={3}>{pilot.school_name}</Heading>
            <Text>
              You are part of <strong>{pilot.pilot_name}</strong>, from {pilot.starts_on} to {pilot.ends_on}.{" "}
              {ended ? "The pilot has ended." : `${pilot.days_left} day${pilot.days_left === 1 ? "" : "s"} remain.`}
            </Text>
            <Text size="sm" muted>
              Pilot access is free and ends on that date without any action from you. Nothing is charged automatically, and nothing here asks you to pay.
              {pilot.conversion_note ? ` ${pilot.conversion_note}` : ""}
            </Text>
            <p className="mt-3 text-sm"><Link className="underline" href="/welcome">A short tour of what is here</Link> · <Link className="underline" href="/feedback">Share feedback or report a problem</Link></p>
          </Card>
        ) : (
          <Card>
            <Heading level={2} size={3}>Join with an access code</Heading>
            <Text size="sm" muted>If your school is part of the pilot, your school contact will give you a code. Codes are personal to your school; please do not share them.</Text>
            <ActionForm action={redeemCodeAction} submit="Join the pilot" className="mt-3 grid max-w-md gap-3">
              <TextField label="Access code" name="code" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="XXXX-XXXX-XXXX" required maxLength={30} />
            </ActionForm>
          </Card>
        )}

        {pilot ? (
          <Card>
            <Heading level={2} size={3}>What would you want after the pilot?</Heading>
            <Text size="sm" muted>This is only a note of interest to help us plan. It does not buy anything, and you can change it any time.{pilot.interest ? ` You said: ${INTEREST_LABEL[pilot.interest] ?? pilot.interest}.` : ""}</Text>
            <ActionForm action={pilotInterestAction} submit="Save my answer" className="mt-3 grid max-w-xl gap-3">
              <SelectField label="Your answer" name="kind" options={options} defaultValue={pilot.interest ?? "need_more_info"} />
              <TextAreaField label="Anything we should know? (optional)" name="note" rows={2} maxLength={500} />
            </ActionForm>
          </Card>
        ) : null}
        <Alert tone="info">The pilot is limited, free for the schools invited, and run with a small team. Please tell us what works and what does not.</Alert>
      </div>
    </>
  );
}
