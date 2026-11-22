import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Heading, Text } from "@/components/ui/typography";
import { annualSavingsPercent, priceLabel } from "@/lib/billing/format";
import type { Catalog, Feature, PlanFeature, PlanKey } from "@/lib/billing/types";

/** What a feature means on a plan, in words. Driven entirely by configuration. */
export function featureCell(feature: Feature, pf: PlanFeature | undefined): { text: string; on: boolean } {
  if (!pf?.enabled) return { text: "Not included", on: false };
  if (feature.kind === "flag") return { text: "Included", on: true };
  if (pf.limit_value == null) return { text: "Unlimited", on: true };
  if (feature.key === "devotional_archive_days") return { text: `Last ${pf.limit_value} days`, on: true };
  return { text: `Up to ${pf.limit_value}`, on: true };
}

/** Plain-language summary line for a feature on a plan, for the card bullet list. */
function bullet(feature: Feature, pf: PlanFeature | undefined): string | null {
  if (!pf?.enabled) return null;
  const cell = featureCell(feature, pf);
  return feature.kind === "limit" ? `${feature.label}: ${cell.text.toLowerCase()}` : feature.label;
}

const PLAN_ORDER: PlanKey[] = ["free", "plus", "school"];

export function PlanGrid({
  catalog, signedIn, currentPlans, checkoutReady,
}: {
  catalog: Catalog;
  signedIn: boolean;
  currentPlans: string[];
  checkoutReady: boolean;
}) {
  const plans = PLAN_ORDER.map((k) => catalog.plans.find((p) => p.key === k)).filter((p) => !!p);
  const pf = (plan: string, feature: string) => catalog.planFeatures.find((x) => x.plan_key === plan && x.feature_key === feature);
  const price = (plan: string, interval: "month" | "year") => catalog.prices.find((p) => p.plan_key === plan && p.plan_interval === interval);
  const userFeatures = catalog.features.filter((f) => f.scope === "user");
  const schoolFeatures = catalog.features.filter((f) => f.scope === "school");

  return (
    <div className="grid min-w-0 gap-12">
      <div className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const month = price(plan.key, "month");
          const year = price(plan.key, "year");
          const monthLabel = priceLabel(month);
          const yearLabel = priceLabel(year);
          const savings = annualSavingsPercent(month, year);
          const current = currentPlans.includes(plan.key);
          const href = plan.key === "free" ? (signedIn ? "/today" : "/signup") : signedIn ? `/upgrade?plan=${plan.key}` : `/signup?next=${encodeURIComponent(`/upgrade?plan=${plan.key}`)}`;
          const highlights = catalog.features
            .filter((f) => plan.key === "school" ? true : f.scope === "user")
            .map((f) => bullet(f, pf(plan.key, f.key)))
            .filter((b): b is string => !!b);
          return (
            <Card key={plan.key} padding="lg" tone={plan.key === "plus" ? "soft" : "default"} className="flex flex-col">
              <Heading level={2} size={4}>{plan.name}</Heading>
              <Text size="sm" muted className="mt-1">{plan.tagline}</Text>
              <div className="mt-5 min-h-16">
                {plan.key === "free" ? (
                  <p className="font-serif text-2xl font-semibold">Free</p>
                ) : monthLabel || yearLabel ? (
                  <>
                    {monthLabel ? <p className="font-serif text-2xl font-semibold">{monthLabel}</p> : null}
                    {yearLabel ? (monthLabel
                      ? <p className="text-sm text-muted">or {yearLabel}{savings ? ` (save ${savings}%)` : ""}</p>
                      : <p className="font-serif text-2xl font-semibold">{yearLabel}</p>) : null}
                    {month?.display_note ? <p className="text-sm text-muted">{month.display_note}</p> : null}
                  </>
                ) : (
                  <p className="text-muted">Pricing coming soon</p>
                )}
              </div>
              <ul className="mt-5 grid flex-1 content-start gap-2 text-sm">
                {highlights.map((h) => (
                  <li key={h} className="flex gap-2"><Icon name="check" size={18} className="mt-0.5 shrink-0 text-brand" /><span>{h}</span></li>
                ))}
              </ul>
              <div className="mt-6">
                {current ? (
                  <p className="rounded-control bg-brand-soft px-4 py-3 text-center text-sm font-semibold text-brand">{plan.key === "free" ? "Your starting plan" : "Your current plan"}</p>
                ) : plan.key === "free" ? (
                  <Link href={href} className={buttonStyles({ variant: "secondary", fullWidth: true })}>{signedIn ? "Go to today" : "Start free"}</Link>
                ) : checkoutReady && (monthLabel || yearLabel) ? (
                  <Link href={href} className={buttonStyles({ fullWidth: true })}>
                    {plan.trial_days > 0 ? `Try free for ${plan.trial_days} days` : `Choose ${plan.name}`}
                  </Link>
                ) : (
                  <p className="rounded-control border border-line px-4 py-3 text-center text-sm text-muted">Not available to purchase yet</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <section aria-labelledby="compare" className="min-w-0">
        <Heading level={2} size={3} id="compare" className="mb-4">Compare plans</Heading>
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">What each plan includes</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="p-4">Feature</th>
                {plans.map((p) => <th key={p.key} scope="col" className="p-4">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {[{ title: "For every educator", list: userFeatures }, { title: "For schools", list: schoolFeatures }].map((group) => (
                <FeatureRows key={group.title} title={group.title} list={group.list} plans={plans.map((p) => p.key)} pf={pf} />
              ))}
              <tr className="border-t border-line">
                <th scope="row" className="p-4 font-semibold">Community</th>
                {plans.map((p) => <td key={p.key} className="p-4">Reading, posting, prayer and group membership are always free</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <Text size="sm" muted className="mt-4 max-w-prose">
          Payment never changes privacy, moderation or who belongs to a group. Your reflections, prayers and saved devotionals stay yours on every plan, including after a plan ends.
        </Text>
      </section>
    </div>
  );
}

function FeatureRows({
  title, list, plans, pf,
}: { title: string; list: Feature[]; plans: PlanKey[]; pf: (plan: string, feature: string) => PlanFeature | undefined }) {
  if (list.length === 0) return null;
  return (
    <>
      <tr className="bg-brand-soft/60"><th colSpan={plans.length + 1} scope="colgroup" className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</th></tr>
      {list.map((f) => (
        <tr key={f.key} className="border-t border-line">
          <th scope="row" className="p-4 font-medium">
            {f.label}
            {f.description ? <span className="block text-xs font-normal text-muted">{f.description}</span> : null}
          </th>
          {plans.map((p) => {
            const cell = featureCell(f, pf(p, f.key));
            return (
              <td key={p} className="p-4">
                {cell.on ? (<span className="inline-flex items-center gap-1.5"><Icon name="check" size={16} className="text-brand" /><span>{cell.text}</span></span>) : (<span className="text-muted"><span aria-hidden="true">—</span><span className="sr-only">{cell.text}</span></span>)}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
