"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requireAccess } from "@/lib/auth/session";
import { findCustomerId, ensureCustomer, findLiveSubscription, findPrice, resolveOwner, type BillingOwner } from "@/lib/billing/owner";
import { idempotencyKey } from "@/lib/billing/idempotency";
import { stripe, StripeError } from "@/lib/billing/stripe";
import { communityError } from "@/lib/community/errors";
import { getPublicEnv, isBillingConfigured } from "@/lib/env";
import { communitySettings } from "@/lib/community/queries";
import { createClient } from "@/lib/supabase/server";

/*
 * Billing actions. They START changes at Stripe; they never grant access themselves.
 * Access follows only from verified webhooks (see /api/stripe/webhook), so a forged form,
 * a replayed success URL or a tampered browser cannot unlock anything.
 */

import { log } from "@/lib/ops/log";

const NOT_OPEN = "Paid plans are not open yet. Your pilot access is not affected.";
const NOT_CONFIGURED = "Billing is not set up yet. Please check back soon.";
const interval = z.enum(["month", "year"]);

const billingPath = (owner: BillingOwner) => (owner.type === "school" ? `/school/${owner.id}/billing` : "/settings/billing");

function stripeMessage(error: unknown): string {
  if (error instanceof StripeError && error.code === "not_configured") return NOT_CONFIGURED;
  log("error", "stripe_call_failed", error instanceof StripeError ? { status: error.status, code: error.code } : { error });
  return "We could not reach the payment provider. Nothing was changed. Please try again.";
}

export async function startCheckoutAction(prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  if (!isBillingConfigured()) return errorState(NOT_CONFIGURED);
  // Launch switch: paid checkout stays closed until an administrator opens it. (Stripe cannot be gated in the database.)
  if ((await communitySettings()).paid_subscriptions_enabled !== true) return errorState(NOT_OPEN);
  const resolved = resolveOwner(ctx, formData);
  if (!resolved.ok) return errorState(resolved.message);
  const owner = resolved.owner;

  const parsed = parseForm(z.object({ plan: z.enum(["plus", "school"]), interval, seats: z.coerce.number().int().min(1).max(5000).default(1) }), formData);
  if (!parsed.ok) return parsed.state;
  const { plan, interval: period, seats } = parsed.data;

  const price = await findPrice(plan, period);
  if (!price) return errorState("That plan is not available for purchase yet.");
  if ((price.audience === "school") !== (owner.type === "school")) {
    return errorState(owner.type === "school" ? "Choose the School License for a school." : "The School License is purchased by a school administrator.");
  }
  if (await findLiveSubscription(owner)) {
    return errorState("There is already a subscription on this account. Manage it from billing settings.");
  }

  let url: string | null = null;
  try {
    const customer = await ensureCustomer(owner);
    const site = getPublicEnv().NEXT_PUBLIC_SITE_URL;
    const session = await stripe.createCheckoutSession({
      customer: customer.id,
      price: price.priceId,
      quantity: price.perSeat ? seats : 1,
      ownerType: owner.type,
      ownerId: owner.id,
      // One free trial per account or school, decided on the server.
      trialDays: !customer.hadTrial && price.trialDays > 0 ? price.trialDays : undefined,
      successUrl: `${site}${billingPath(owner)}?checkout=success`,
      cancelUrl: `${site}${billingPath(owner)}?checkout=cancelled`,
      // Same inputs within the hour reuse the same session instead of creating duplicates, unless the last attempt failed.
      idempotencyKey: idempotencyKey(`checkout-${owner.type}-${owner.id}-${plan}-${period}-${seats}`, 3_600_000, prev),
    });
    url = session.url;
  } catch (error) {
    return errorState(stripeMessage(error));
  }
  if (!url) return errorState("Checkout could not be started. Please try again.");
  redirect(url);
}

export async function openPortalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  if (!isBillingConfigured()) return errorState(NOT_CONFIGURED);
  const resolved = resolveOwner(ctx, formData);
  if (!resolved.ok) return errorState(resolved.message);
  const customer = await findCustomerId(resolved.owner);
  if (!customer) return errorState("There is no billing account to manage yet.");
  let url: string;
  try {
    const site = getPublicEnv().NEXT_PUBLIC_SITE_URL;
    url = (await stripe.createPortalSession({ customer, returnUrl: `${site}${billingPath(resolved.owner)}` })).url;
  } catch (error) {
    return errorState(stripeMessage(error));
  }
  redirect(url);
}

/** Switch between monthly and annual on the current plan. Stripe prorates. */
export async function changeIntervalAction(prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  if (!isBillingConfigured()) return errorState(NOT_CONFIGURED);
  const resolved = resolveOwner(ctx, formData);
  if (!resolved.ok) return errorState(resolved.message);
  const parsed = parseForm(z.object({ interval }), formData);
  if (!parsed.ok) return parsed.state;

  const sub = await findLiveSubscription(resolved.owner);
  if (!sub) return errorState("There is no active subscription to change.");
  if (sub.plan_interval === parsed.data.interval) return errorState("You are already on that billing period.");
  const price = await findPrice(sub.plan_key, parsed.data.interval);
  if (!price) return errorState("That billing period is not available.");
  try {
    const current = await stripe.getSubscription(sub.stripe_subscription_id);
    const item = current.items.data[0];
    if (!item) return errorState("The subscription could not be read. Nothing was changed.");
    await stripe.updateSubscriptionItem({
      subscriptionId: sub.stripe_subscription_id, itemId: item.id, price: price.priceId,
      idempotencyKey: idempotencyKey(`interval-${sub.stripe_subscription_id}-${parsed.data.interval}`, 600_000, prev),
    });
  } catch (error) {
    return errorState(stripeMessage(error));
  }
  revalidatePath(billingPath(resolved.owner));
  return successState("Your billing period is being updated. The change appears here in a moment, with any difference prorated.");
}

/** A school changes how many seats it licenses. */
export async function changeSeatsAction(prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  if (!isBillingConfigured()) return errorState(NOT_CONFIGURED);
  const resolved = resolveOwner(ctx, formData);
  if (!resolved.ok) return errorState(resolved.message);
  if (resolved.owner.type !== "school") return errorState("Seats belong to a school license.");
  const parsed = parseForm(z.object({ seats: z.coerce.number().int().min(1, "Choose at least one seat.").max(5000) }), formData);
  if (!parsed.ok) return parsed.state;

  const sub = await findLiveSubscription(resolved.owner);
  if (!sub) return errorState("There is no active school subscription to change.");
  try {
    const current = await stripe.getSubscription(sub.stripe_subscription_id);
    const item = current.items.data[0];
    if (!item) return errorState("The subscription could not be read. Nothing was changed.");
    await stripe.updateSubscriptionItem({
      subscriptionId: sub.stripe_subscription_id, itemId: item.id, quantity: parsed.data.seats,
      idempotencyKey: idempotencyKey(`seats-${sub.stripe_subscription_id}-${parsed.data.seats}`, 600_000, prev),
    });
  } catch (error) {
    return errorState(stripeMessage(error));
  }
  revalidatePath(billingPath(resolved.owner));
  return successState("Seats are being updated. The new count appears here in a moment; any cost difference is prorated.");
}

/** Cancel at the end of the paid period, or undo a pending cancellation. */
export async function setCancellationAction(prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  if (!isBillingConfigured()) return errorState(NOT_CONFIGURED);
  const resolved = resolveOwner(ctx, formData);
  if (!resolved.ok) return errorState(resolved.message);
  const parsed = parseForm(z.object({ cancel: z.enum(["yes", "no"]) }), formData);
  if (!parsed.ok) return parsed.state;
  const sub = await findLiveSubscription(resolved.owner);
  if (!sub) return errorState("There is no active subscription to change.");
  const cancel = parsed.data.cancel === "yes";
  try {
    await stripe.setCancelAtPeriodEnd({
      subscriptionId: sub.stripe_subscription_id, cancel,
      idempotencyKey: idempotencyKey(`cancel-${sub.stripe_subscription_id}-${cancel}`, 600_000, prev),
    });
  } catch (error) {
    return errorState(stripeMessage(error));
  }
  revalidatePath(billingPath(resolved.owner));
  return successState(cancel
    ? "Your plan will end at the close of the current period. You keep full access until then, and everything you saved stays yours."
    : "Your plan will continue as normal.");
}

// ----- Seats (database functions authorize the caller) -----

const seatForm = z.object({ schoolId: z.uuid(), userId: z.uuid() });

async function seatAction(fn: "assign_seat" | "release_seat", formData: FormData, done: string): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(seatForm, formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { sid: parsed.data.schoolId, uid: parsed.data.userId });
  if (error) return errorState(communityError(error, "That seat could not be changed."));
  revalidatePath(`/school/${parsed.data.schoolId}/billing`);
  revalidatePath(`/school/${parsed.data.schoolId}/seats`);
  return successState(done);
}
export const assignSeatAction = async (_p: FormState, f: FormData) => seatAction("assign_seat", f, "Seat assigned.");
export const releaseSeatAction = async (_p: FormState, f: FormData) => seatAction("release_seat", f, "Seat released.");

/** A person chooses whether their completion counts appear in their school's totals. */
export async function setAggregateSharingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  const share = formData.get("share") === "on";
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ share_school_aggregates: share }).eq("id", ctx.user.id);
  if (error) return errorState("That could not be saved. Please try again.");
  revalidatePath("/settings");
  return successState(share ? "Your completions count toward your school's totals." : "Your completions are left out of your school's totals.");
}
