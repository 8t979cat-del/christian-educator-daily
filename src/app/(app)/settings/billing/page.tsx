import type { Metadata } from "next";
import Link from "next/link";
import { CancelForm, ChangeIntervalForm, PortalButton } from "@/components/billing/forms";
import { BillingNotices } from "@/components/billing/notices";
import { PageHeader } from "@/components/layout/container";
import { Card } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { buttonStyles } from "@/components/ui/button";
import { Heading, Text } from "@/components/ui/typography";
import { requireAccess } from "@/lib/auth/session";
import { describeSubscription, formatMoney } from "@/lib/billing/format";
import { getCatalog, getEntitlements, getInvoices, getMySubscriptions, getNotices } from "@/lib/billing/queries";

export const metadata: Metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireAccess();
  const sp = await searchParams;
  const checkout = one(sp.checkout);
  const [catalog, subs, invoices, notices, entitlements] = await Promise.all([getCatalog(), getMySubscriptions(), getInvoices({}), getNotices(), getEntitlements()]);

  const current = subs.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));
  const planName = (key: string) => catalog.plans.find((p) => p.key === key)?.name ?? key;
  const schoolPlans = ctx.memberships.filter((m) => entitlements.plans.includes("school"));
  const viaSchool = entitlements.plans.includes("school");

  return (
    <>
      <PageHeader title="Billing" description="Your plan, payment method and receipts." actions={<Link href="/settings" className={buttonStyles({ variant: "ghost" })}>Back to settings</Link>} />
      {checkout === "success" ? (
        <Alert tone="success" title="Thank you">
          {current ? "Your plan is active." : "Your payment went through. Your plan appears here as soon as the payment provider confirms it, usually within a minute; refresh to check."}
        </Alert>
      ) : checkout === "cancelled" ? (
        <Alert tone="info" title="No charge was made">You can choose a plan whenever you are ready.</Alert>
      ) : null}
      <div className="mt-4"><BillingNotices notices={notices} only="user" /></div>

      <div className="grid max-w-3xl gap-6">
        <Card padding="lg">
          <div className="flex flex-wrap items-center gap-3">
            <Heading level={2} size={4}>{current ? planName(current.plan_key) : entitlements.plans.includes("plus") ? "Educator Plus (complimentary)" : "Free Educator"}</Heading>
            {current ? (() => { const d = describeSubscription(current); return <Badge>{d.label}</Badge>; })() : <Badge>Active</Badge>}
          </div>
          {current ? (
            <>
              <Text className="mt-2" muted>{describeSubscription(current).detail}</Text>
              <div className="mt-5 flex flex-wrap gap-4">
                <PortalButton owner={{ owner: "user" }} />
                {current.status !== "unpaid" ? <ChangeIntervalForm owner={{ owner: "user" }} to={current.plan_interval === "year" ? "month" : "year"} label={current.plan_interval === "year" ? "Switch to monthly" : "Switch to annual"} /> : null}
              </div>
              <div className="mt-6 border-t border-line pt-5">
                <CancelForm owner={{ owner: "user" }} pendingCancel={current.cancel_at_period_end} />
              </div>
            </>
          ) : (
            <>
              <Text className="mt-2" muted>
                {viaSchool ? "You also have Educator Plus features through your school’s license." : "Daily devotionals, classroom presentation and the community are free."}
              </Text>
              <div className="mt-5"><Link href="/upgrade" className={buttonStyles()}>See Educator Plus</Link></div>
            </>
          )}
        </Card>

        {schoolPlans.length > 0 && viaSchool ? (
          <Card padding="lg">
            <Heading level={2} size={4}>Through your school</Heading>
            <Text className="mt-2" muted>Your school provides a seat. Your school administrator manages that license; you are never billed for it.</Text>
          </Card>
        ) : null}

        <Card padding="lg">
          <Heading level={2} size={4}>Receipts</Heading>
          {invoices.length === 0 ? (
            <Text className="mt-2" muted>Receipts appear here after your first payment. Stripe also emails one each time.</Text>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {invoices.map((inv) => (
                <li key={inv.stripe_invoice_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>{new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  <span>{formatMoney(inv.status === "paid" ? inv.amount_paid : inv.amount_due, inv.currency) ?? "—"} · <span className="capitalize">{inv.status}</span></span>
                  {inv.hosted_invoice_url ? <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline-offset-4 hover:underline">View receipt<span className="sr-only"> (opens in a new tab)</span></a> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>Your content is yours</Heading>
          <Text className="mt-2" muted>
            Changing or ending a plan never deletes your bookmarks, notes, reflections or prayers. Premium features pause; your writing stays. We never sell prayer content or build advertising profiles from religious participation.
          </Text>
        </Card>
      </div>
    </>
  );
}
