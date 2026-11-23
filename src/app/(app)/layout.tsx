import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { requireAccess } from "@/lib/auth/session";
import { getEntitlements } from "@/lib/billing/queries";
import { touchActive } from "@/lib/governance/queries";
import { myPilot } from "@/lib/launch/queries";
import { Alert } from "@/components/ui/feedback";
import Link from "next/link";

// Auth state is per-request; never prerender these routes.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Signed in, email verified and onboarding complete, or this redirects.
  // Each page and server action re-checks its own permissions as well.
  const { profile, platformRoles, user, memberships } = await requireAccess();
  await touchActive();
  const name = profile.display_name || user.email;
  const plans = (await getEntitlements()).plans;
  const planLabel = plans.includes("school") ? "School" : plans.includes("plus") ? "Plus" : "Free";

  const pilot = await myPilot();
  // A calm, factual note only when the pilot is closing or over. It never pressures anyone to buy.
  const pilotNote = pilot && (pilot.status === "closed" || pilot.days_left <= 14)
    ? pilot.status === "closed" || pilot.days_left < 0
      ? `${pilot.pilot_name} has ended.`
      : `${pilot.pilot_name} ends in ${pilot.days_left} day${pilot.days_left === 1 ? "" : "s"}.`
    : null;

  return (
    <AppShell userName={name} isStaff={platformRoles.length > 0} planLabel={planLabel} inSchool={memberships.length > 0}>
      {pilotNote ? (
        <Alert tone="info" className="mb-6">
          {pilotNote} <Link className="underline" href="/pilot">See what happens next</Link>
        </Alert>
      ) : null}
      {children}
    </AppShell>
  );
}
