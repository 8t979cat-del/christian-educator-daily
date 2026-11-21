import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutForm } from "@/components/billing/forms";
import { PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/typography";
import { requireAccess } from "@/lib/auth/session";
import { priceLabel } from "@/lib/billing/format";
import { getCatalog, getEntitlements, getMySubscriptions } from "@/lib/billing/queries";
import { isBillingConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Upgrade" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function UpgradePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess();
  const sp = await searchParams;
  const planKey = one(sp.plan) === "school" ? "school" : "plus";
  const featureKey = one(sp.feature);

  const [catalog, subs, entitlements] = await Promise.all([getCatalog(), getMySubscriptions(), getEntitlements()]);
  const plan = catalog.plans.find((p) => p.key === planKey);
  const feature = catalog.features.find((f) => f.key === featureKey);
  const intervals = (["year", "month"] as const).flatMap((interval) => {
    const label = priceLabel(catalog.prices.find((p) => p.plan_key === planKey && p.plan_interval === interval));
    return label ? [{ value: interval, label }] : [];
  });
  const adminSchools = ctx.memberships.filter((m) => m.role === "owner" || m.role === "admin");
  const perSeat = catalog.prices.some((p) => p.plan_key === planKey && p.per_seat);
  const hasPlan = planKey === "plus" && entitlements.plans.includes("plus");
  const alreadySubscribed = planKey === "plus" && subs.some((s) => ["active", "trialing", "past_due"].includes(s.status));

  return (
    <>
      <PageHeader
        title={plan ? `Choose ${plan.name}` : "Choose a plan"}
        description={feature ? `${feature.label} is part of ${plan?.name ?? "a paid plan"}. Everything you already have stays exactly as it is.` : plan?.tagline}
      />
      <div className="grid max-w-2xl gap-6">
        {!isBillingConfigured() ? (
          <Alert tone="info" title="Billing is not set up yet">Plans cannot be purchased right now. Your free access is unchanged.</Alert>
        ) : intervals.length === 0 ? (
          <Alert tone="info" title="This plan is not available to purchase yet">Prices have not been published. Please check back soon.</Alert>
        ) : alreadySubscribed || hasPlan ? (
          <Alert tone="success" title="You already have this plan">
            Manage it from <Link href="/settings/billing" className="font-semibold underline">billing settings</Link>.
          </Alert>
        ) : planKey === "school" ? (
          adminSchools.length === 0 ? (
            <Alert tone="info" title="School licenses are bought by a school administrator">
              Create your school or ask your administrator. <Link href="/school" className="font-semibold underline">Go to My School</Link>.
            </Alert>
          ) : (
            <div className="grid gap-6">
              {adminSchools.map((school) => (
                <Card key={school.schoolId} padding="lg">
                  <h2 className="mb-4 font-serif text-xl font-normal">{school.schoolName}</h2>
                  <CheckoutForm plan="school" owner={{ owner: "school", schoolId: school.schoolId }} intervals={intervals} perSeat={perSeat} trialDays={plan?.trial_days ?? 0} submitLabel="Continue to secure checkout" />
                </Card>
              ))}
            </div>
          )
        ) : (
          <Card padding="lg">
            <CheckoutForm plan="plus" owner={{ owner: "user" }} intervals={intervals} perSeat={false} trialDays={plan?.trial_days ?? 0} submitLabel="Continue to secure checkout" />
          </Card>
        )}
        <Text size="sm" muted>
          Coming back from checkout can take a few seconds to show your new plan. Access is switched on only after the payment provider confirms, never from this page.{" "}
          <Link href="/pricing" className="underline">Compare plans</Link>
        </Text>
      </div>
    </>
  );
}
