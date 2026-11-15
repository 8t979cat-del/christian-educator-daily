"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requirePlatformRole } from "@/lib/auth/session";
import { stripe, StripeError } from "@/lib/billing/stripe";
import { communityError } from "@/lib/community/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
 * Plans, features, prices and complimentary access. Platform administrators only: checked here for
 * a friendly redirect, and again inside every database function, which is what actually decides.
 */

const PLANS = ["free", "plus", "school"] as const;
const done = () => { revalidatePath("/admin/billing"); revalidatePath("/pricing"); };

/** One row of the feature matrix: every plan's on/off and limit for one feature. */
export async function saveFeatureRowAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({ feature: z.string().regex(/^[a-z_]{2,41}$/) }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  for (const plan of PLANS) {
    const enabled = formData.get(`${plan}_enabled`) === "on";
    const raw = String(formData.get(`${plan}_limit`) ?? "").trim();
    const limit = raw === "" ? null : Number(raw);
    if (limit !== null && (!Number.isInteger(limit) || limit < 0)) return errorState("Limits are whole numbers, or blank for unlimited.");
    const { error } = await supabase.rpc("admin_set_plan_feature", { p_plan: plan, p_feature: parsed.data.feature, p_enabled: enabled, p_limit: limit });
    if (error) return errorState(communityError(error));
  }
  done();
  return successState("Saved. The change applies immediately, with no deploy.");
}

const priceForm = z.object({
  plan: z.enum(["plus", "school"]),
  interval: z.enum(["month", "year"]),
  stripePriceId: z.string().trim().max(120).default(""),
  note: z.string().trim().max(120).default(""),
  intent: z.enum(["save", "refresh"]).default("save"),
});

export async function savePriceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(priceForm, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const active = formData.get("active") === "on";
  const supabase = await createClient();

  let currency: string | null = null;
  let amount: number | null = null;
  if (d.stripePriceId && d.intent === "refresh") {
    try {
      const price = await stripe.getPrice(d.stripePriceId);
      if (price.recurring?.interval !== d.interval) return errorState(`That Stripe price bills ${price.recurring?.interval ?? "once"}, not by the ${d.interval}.`);
      if (!price.active) return errorState("That Stripe price is archived in Stripe.");
      currency = price.currency;
      amount = price.unit_amount;
    } catch (error) {
      return errorState(error instanceof StripeError && error.code === "not_configured" ? "Stripe is not configured on this server." : "Stripe could not find that price.");
    }
  } else {
    // Keep the displayed amount unless refreshed from Stripe.
    const { data } = await supabase.rpc("admin_list_prices");
    const existing = ((data ?? []) as { plan_key: string; plan_interval: string; currency: string | null; unit_amount: number | null }[]).find((p) => p.plan_key === d.plan && p.plan_interval === d.interval);
    currency = existing?.currency ?? null;
    amount = existing?.unit_amount ?? null;
  }
  const { error } = await supabase.rpc("admin_set_price", {
    p_plan: d.plan, p_interval: d.interval, p_stripe_price_id: d.stripePriceId, p_currency: currency, p_amount: amount, p_active: active, p_note: d.note,
  });
  if (error) return errorState(communityError(error));
  done();
  return successState(d.intent === "refresh" ? "Saved, with the amount read from Stripe." : active && !d.stripePriceId ? "Saved. A price needs a Stripe price id before it can be offered." : "Saved.");
}

export async function updatePlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({
    plan: z.enum(PLANS), name: z.string().trim().min(1).max(60), tagline: z.string().trim().max(160).default(""),
    trialDays: z.coerce.number().int().min(0).max(90),
  }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_plan", {
    p_plan: parsed.data.plan, p_name: parsed.data.name, p_tagline: parsed.data.tagline, p_trial_days: parsed.data.trialDays, p_public: true,
  });
  if (error) return errorState(communityError(error));
  done();
  return successState("Saved.");
}

export async function saveSettingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({
    past_due_grace_days: z.coerce.number().int().min(0).max(60),
    period_slack_hours: z.coerce.number().int().min(0).max(240),
    trial_notice_days: z.coerce.number().int().min(0).max(30),
    analytics_min_group: z.coerce.number().int().min(2).max(500),
  }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  for (const [key, value] of Object.entries(parsed.data)) {
    const { error } = await supabase.rpc("admin_set_billing_setting", { p_key: key, p_value: value });
    if (error) return errorState(communityError(error));
  }
  done();
  return successState("Saved.");
}

export async function grantPlanAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({
    email: z.email("Enter the person's email address."),
    reason: z.string().trim().min(1, "Say why, so the record makes sense later.").max(300),
    expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  }), formData);
  if (!parsed.ok) return parsed.state;
  const admin = createAdminClient();
  if (!admin) return errorState("The server key is not configured, so people cannot be looked up by email.");
  let userId: string | null = null;
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return errorState("People could not be looked up.");
    userId = data.users.find((u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase())?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) return errorState("No account was found with that email.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_plan", {
    p_user: userId, p_plan: "plus", p_reason: parsed.data.reason, p_expires: parsed.data.expires ? `${parsed.data.expires}T23:59:59Z` : null,
  });
  if (error) return errorState(communityError(error));
  done();
  return successState("Educator Plus granted.");
}

export async function revokeGrantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({ id: z.uuid() }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_grant", { p_id: parsed.data.id });
  if (error) return errorState(communityError(error));
  done();
  return successState("Revoked.");
}
