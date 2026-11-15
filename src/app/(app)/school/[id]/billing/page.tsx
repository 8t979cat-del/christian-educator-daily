import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelForm, ChangeIntervalForm, ChangeSeatsForm, CheckoutForm, PortalButton, SeatButton } from "@/components/billing/forms";
import { BillingNotices } from "@/components/billing/notices";
import { PageHeader } from "@/components/layout/container";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Heading, Text } from "@/components/ui/typography";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireSchoolRole } from "@/lib/auth/session";
import { describeSubscription, formatMoney, priceLabel } from "@/lib/billing/format";
import { getCatalog, getInvoices, getNotices, getSchoolLicense, getSchoolSubscriptions, getSeatStatus } from "@/lib/billing/queries";
import { isBillingConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "School license" };
export const dynamic = "force-dynamic";

export default async function SchoolBillingPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { membership } = await requireSchoolRole(id, ["owner", "admin"]);
  const sp = await searchParams;
  const checkout = Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout;

  const [catalog, subs, license, seats, invoices, notices] = await Promise.all([
    getCatalog(), getSchoolSubscriptions(id), getSchoolLicense(id), getSeatStatus(id), getInvoices({ schoolId: id }), getNotices(),
  ]);
  const current = subs.find((s) => ["active", "trialing", "past_due", "unpaid"].includes(s.status));
  const intervals = (["year", "month"] as const).flatMap((interval) => {
    const label = priceLabel(catalog.prices.find((p) => p.plan_key === "school" && p.plan_interval === interval));
    return label ? [{ value: interval, label }] : [];
  });
  const plan = catalog.plans.find((p) => p.key === "school");
  const used = seats.filter((s) => s.has_seat).length;
  const members = seats.length;
  const owner = { owner: "school", schoolId: id } as const;

  return (
    <>
      <PageHeader
        title={`${membership.schoolName}: School License`}
        description="Seats, billing and invoices for your school."
        actions={<>
          <Link href={`/school/${id}/tools`} className={buttonStyles({ variant: "secondary" })}>Shared tools</Link>
          <Link href="/school" className={buttonStyles({ variant: "ghost" })}>Back to My School</Link>
        </>}
      />
      {checkout === "success" ? (
        <Alert tone="success" title="Thank you">
          {current ? "Your school license is active." : "Payment went through. The license appears here as soon as the payment provider confirms it, usually within a minute; refresh to check."}
        </Alert>
      ) : checkout === "cancelled" ? <Alert tone="info" title="No charge was made">Choose a plan whenever you are ready.</Alert> : null}
      <div className="mt-4"><BillingNotices notices={notices.filter((n) => n.school_id === id)} /></div>

      <div className="grid max-w-4xl gap-6">
        {!current ? (
          <Card padding="lg">
            <Heading level={2} size={4}>{plan?.name ?? "School License"}</Heading>
            <Text className="mt-2 mb-5" muted>{plan?.tagline}</Text>
            {!isBillingConfigured() ? (
              <Alert tone="info" title="Billing is not set up yet">The license cannot be purchased right now.</Alert>
            ) : intervals.length === 0 ? (
              <Alert tone="info" title="Not available to purchase yet">Prices have not been published.</Alert>
            ) : (
              <CheckoutForm plan="school" owner={owner} intervals={intervals} perSeat trialDays={plan?.trial_days ?? 0} submitLabel="Continue to secure checkout" />
            )}
          </Card>
        ) : (
          <Card padding="lg">
            <div className="flex flex-wrap items-center gap-3">
              <Heading level={2} size={4}>{plan?.name ?? "School License"}</Heading>
              <Badge>{describeSubscription(current).label}</Badge>
            </div>
            <Text className="mt-2" muted>{describeSubscription(current).detail}</Text>
            <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
              {[["Licensed seats", String(license?.seats ?? current.seats)], ["Seats in use", String(used)], ["Active members", String(members)]].map(([k, v]) => (
                <div key={k} className="rounded-control bg-brand-soft p-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-serif text-2xl font-semibold">{v}</dd></div>
              ))}
            </dl>
            <div className="mt-6 grid gap-6">
              <ChangeSeatsForm schoolId={id} seats={current.seats} />
              <div className="flex flex-wrap gap-4">
                <PortalButton owner={owner} label="Payment method, invoices and billing contact" />
                <ChangeIntervalForm owner={owner} to={current.plan_interval === "year" ? "month" : "year"} label={current.plan_interval === "year" ? "Switch to monthly" : "Switch to annual"} />
              </div>
              <div className="border-t border-line pt-5"><CancelForm owner={owner} pendingCancel={current.cancel_at_period_end} /></div>
            </div>
          </Card>
        )}

        <Card padding="lg">
          <Heading level={2} size={4}>Seats</Heading>
          <Text className="mt-1 mb-4" size="sm" muted>
            A seat gives a member the School License features. People who join are given a seat automatically while seats remain. Releasing a seat never removes anyone from the school or touches their own content.
          </Text>
          {seats.length === 0 ? <Text muted>No active members yet.</Text> : (
            <ul className="divide-y divide-line">
              {seats.map((s) => (
                <li key={s.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span>
                    <span className="font-medium">{s.first_name} {s.last_name}</span>
                    <span className="ml-2 text-sm capitalize text-muted">{s.role}</span>
                    {s.has_seat && !s.in_limit ? <Badge className="ml-2">Over seat limit</Badge> : null}
                  </span>
                  {s.has_seat ? <SeatButton kind="release" schoolId={id} userId={s.user_id} label="Release seat" /> : current || license ? <SeatButton kind="assign" schoolId={id} userId={s.user_id} label="Assign seat" /> : <span className="text-sm text-muted">No license</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg">
          <Heading level={2} size={4}>Invoices</Heading>
          {invoices.length === 0 ? <Text className="mt-2" muted>Invoices appear here after the first payment.</Text> : (
            <ul className="mt-3 divide-y divide-line">
              {invoices.map((inv) => (
                <li key={inv.stripe_invoice_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>{new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                  <span>{formatMoney(inv.status === "paid" ? inv.amount_paid : inv.amount_due, inv.currency) ?? "—"} · <span className="capitalize">{inv.status}</span></span>
                  {inv.hosted_invoice_url ? <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline-offset-4 hover:underline">View invoice<span className="sr-only"> (opens in a new tab)</span></a> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padding="lg" tone="soft">
          <Heading level={2} size={4}>What administrators can and cannot see</Heading>
          <Text className="mt-2" muted>
            You manage seats, billing, shared collections and assignments. You see combined completion totals, only once several faculty are counted, and only for those who allow it.
            You never see an individual&apos;s prayers, reflections, notes or bookmarks, and removing someone never exposes or deletes them.
          </Text>
        </Card>
      </div>
    </>
  );
}
