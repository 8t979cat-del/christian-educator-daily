import type { Metadata } from "next";
import { AdminNav } from "@/components/content/admin-nav";
import { FeatureRow, GrantForm, PlanForm, PriceForm, RevokeButton, SettingsForm } from "@/components/billing/admin-forms";
import { PageHeader } from "@/components/layout/container";
import { Alert } from "@/components/ui/feedback";
import { Card } from "@/components/ui/card";
import { Heading, Text } from "@/components/ui/typography";
import { requirePlatformRole } from "@/lib/auth/session";
import { formatMoney } from "@/lib/billing/format";
import { getCatalog } from "@/lib/billing/queries";
import { isBillingConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plans and billing (admin)" };
export const dynamic = "force-dynamic";

type PriceRow = { plan_key: "plus" | "school"; plan_interval: "month" | "year"; stripe_price_id: string | null; currency: string | null; unit_amount: number | null; active: boolean; display_note: string };

export default async function AdminBillingPage() {
  await requirePlatformRole(["platform_admin"]);
  const supabase = await createClient();
  const [catalog, prices, settings, grants] = await Promise.all([
    getCatalog(),
    supabase.rpc("admin_list_prices"),
    supabase.from("billing_settings").select("key, value"),
    supabase.from("entitlement_grants").select("id, user_id, plan_key, reason, expires_at, revoked_at, created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  const priceRows = (prices.data ?? []) as PriceRow[];
  const values = Object.fromEntries(((settings.data ?? []) as { key: string; value: unknown }[]).map((s) => [s.key, Number(s.value)]));
  const grantRows = (grants.data ?? []) as { id: string; user_id: string; plan_key: string; reason: string; expires_at: string | null; revoked_at: string | null }[];

  return (
    <>
      <PageHeader title="Plans and billing" description="What each plan includes, how it is priced, and for how long access lasts. Everything here is data: changes apply immediately and need no deploy." />
      <AdminNav current="/admin/billing" isAdmin />
      {!isBillingConfigured() ? <Alert tone="info" title="Stripe is not configured on this server" className="mb-6">Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Until then plans cannot be purchased.</Alert> : null}
      <div className="grid gap-6">
        <Card padding="lg">
          <Heading level={2} size={4}>Plans</Heading>
          <div className="mt-4 grid gap-3">{catalog.plans.map((p) => <PlanForm key={p.key} plan={p.key} name={p.name} tagline={p.tagline} trialDays={p.trial_days} />)}</div>
        </Card>
        <Card padding="lg">
          <Heading level={2} size={4}>What each plan includes</Heading>
          <Text size="sm" muted className="mt-1 mb-3">Turn a feature on or off per plan. For counted features, a blank limit means unlimited. Lowering a limit never deletes what people already have.</Text>
          {catalog.features.map((f) => (
            <FeatureRow key={f.key} feature={f.key} label={f.label} kind={f.kind}
              cells={Object.fromEntries(catalog.plans.map((p) => { const pf = catalog.planFeatures.find((x) => x.plan_key === p.key && x.feature_key === f.key); return [p.key, { enabled: pf?.enabled ?? false, limit: pf?.limit_value ?? null }]; }))} />
          ))}
        </Card>
        <Card padding="lg">
          <Heading level={2} size={4}>Prices</Heading>
          <Text size="sm" muted className="mt-1 mb-4">Create each price in your Stripe dashboard, paste its id, and read the amount back. No price is built into the code.</Text>
          <div className="grid gap-4 lg:grid-cols-2">
            {priceRows.map((p) => <PriceForm key={`${p.plan_key}${p.plan_interval}`} plan={p.plan_key} interval={p.plan_interval} stripePriceId={p.stripe_price_id ?? ""} active={p.active} note={p.display_note} display={formatMoney(p.unit_amount, p.currency) ?? ""} />)}
          </div>
        </Card>
        <Card padding="lg"><Heading level={2} size={4} className="mb-4">Timing and privacy thresholds</Heading><SettingsForm values={values} /></Card>
        <Card padding="lg">
          <Heading level={2} size={4}>Complimentary access</Heading>
          <div className="mt-4"><GrantForm /></div>
          {grantRows.length > 0 ? (
            <ul className="mt-5 divide-y divide-line">
              {grantRows.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <span>{g.reason} <span className="text-muted">· {g.plan_key}{g.expires_at ? ` · until ${g.expires_at.slice(0, 10)}` : ""}{g.revoked_at ? " · revoked" : ""}</span></span>
                  {g.revoked_at ? null : <RevokeButton id={g.id} />}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </>
  );
}
