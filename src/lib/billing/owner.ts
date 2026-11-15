import "server-only";
import { z } from "zod";
import type { AccessContext } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "./stripe";

/**
 * Who a subscription belongs to, and whether the signed-in person may manage it.
 * The person comes from the SESSION. The form supplies only a choice ("my own" or a school id),
 * which is checked against that person's real memberships before anything happens.
 */
export type BillingOwner =
  | { type: "user"; id: string; name: string; email: string | undefined }
  | { type: "school"; id: string; name: string; email: string | undefined };

const ownerForm = z.object({ owner: z.enum(["user", "school"]), schoolId: z.uuid().optional() });

export function resolveOwner(ctx: AccessContext, formData: FormData): { ok: true; owner: BillingOwner } | { ok: false; message: string } {
  const parsed = ownerForm.safeParse({
    owner: formData.get("owner") ?? "user",
    schoolId: formData.get("schoolId") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "That request was not understood." };
  if (parsed.data.owner === "user") {
    return { ok: true, owner: { type: "user", id: ctx.user.id, name: `${ctx.profile.first_name} ${ctx.profile.last_name}`.trim(), email: ctx.user.email || undefined } };
  }
  const membership = ctx.memberships.find((m) => m.schoolId === parsed.data.schoolId);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { ok: false, message: "Only a school owner or administrator can manage school billing." };
  }
  return { ok: true, owner: { type: "school", id: membership.schoolId, name: membership.schoolName, email: ctx.user.email || undefined } };
}

const LIVE = ["active", "trialing", "past_due", "incomplete"];

/** The owner's current (not ended) subscription, read with the server key. */
export async function findLiveSubscription(owner: BillingOwner) {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, plan_key, plan_interval, seats, status")
    .eq(owner.type === "user" ? "user_id" : "school_id", owner.id)
    .in("status", LIVE)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export async function findCustomerId(owner: BillingOwner): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq(owner.type === "user" ? "user_id" : "school_id", owner.id)
    .maybeSingle();
  return data?.stripe_customer_id ?? null;
}

/** Finds or creates the Stripe customer for an owner. Safe to call twice at once. */
export async function ensureCustomer(owner: BillingOwner): Promise<{ id: string; hadTrial: boolean }> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Server is not configured.");
  const column = owner.type === "user" ? "user_id" : "school_id";
  const read = async () =>
    (await admin.from("billing_customers").select("stripe_customer_id, had_trial").eq(column, owner.id).maybeSingle()).data;
  const existing = await read();
  if (existing) return { id: existing.stripe_customer_id, hadTrial: existing.had_trial };

  const created = await stripe.createCustomer({ email: owner.email, name: owner.name, ownerType: owner.type, ownerId: owner.id });
  await admin.from("billing_customers").insert({ owner_type: owner.type, [column]: owner.id, stripe_customer_id: created.id });
  const row = await read();
  return { id: row?.stripe_customer_id ?? created.id, hadTrial: row?.had_trial ?? false };
}

/** The configured Stripe price for a plan and interval, or null when none is set up. */
export async function findPrice(planKey: string, interval: "month" | "year") {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("plan_prices")
    .select("stripe_price_id, active, per_seat, plans!inner(audience, trial_days)")
    .eq("plan_key", planKey)
    .eq("plan_interval", interval)
    .maybeSingle();
  if (!data || !data.active || !data.stripe_price_id) return null;
  const plan = Array.isArray(data.plans) ? data.plans[0] : data.plans;
  if (!plan) return null;
  return { priceId: data.stripe_price_id, perSeat: data.per_seat, audience: plan.audience as "individual" | "school", trialDays: plan.trial_days as number };
}
