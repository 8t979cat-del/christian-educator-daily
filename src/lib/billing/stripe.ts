import "server-only";
import { getStripeEnv } from "@/lib/env";

/**
 * A small Stripe REST client (no SDK, so nothing extra to install or audit). Only the calls
 * this app makes are here. Every write carries an idempotency key so a retried request cannot
 * create a second customer, session or change.
 */

const API = "https://api.stripe.com/v1";
/**
 * Every request names its API version, so a change to the account's default can never change what
 * we send or receive. Create the webhook endpoint with the same version (Stripe Dashboard >
 * Developers > Webhooks), so event payloads have the shape billing_apply_event reads.
 */
export const STRIPE_API_VERSION = "2026-11-18.endive";

export class StripeError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "StripeError";
  }
}

type Encodable = string | number | boolean | null | undefined | Encodable[] | { [key: string]: Encodable };

/** Stripe takes form-encoded bodies with bracket notation for nesting: `items[0][price]=...`. */
export function encodeForm(value: { [key: string]: Encodable }, prefix = ""): string {
  const pairs: string[] = [];
  const add = (key: string, v: Encodable) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) v.forEach((item, i) => add(`${key}[${i}]`, item));
    else if (typeof v === "object") pairs.push(encodeForm(v, key));
    else pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(value)) add(prefix ? `${prefix}[${k}]` : k, v);
  return pairs.filter(Boolean).join("&");
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: { [key: string]: Encodable },
  idempotencyKey?: string,
): Promise<T> {
  const env = getStripeEnv();
  if (!env) throw new StripeError("Billing is not configured.", 503, "not_configured");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.secretKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? encodeForm(body) : undefined,
    cache: "no-store",
  });
  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & T;
  if (!response.ok) {
    throw new StripeError(json.error?.message ?? `Stripe returned ${response.status}.`, response.status, json.error?.code);
  }
  return json;
}

export type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  items: { data: { id: string; quantity?: number; price: { id: string } }[] };
};
export type StripePrice = {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: { interval: "month" | "year" } | null;
};

export const stripe = {
  createCustomer: (input: { email?: string; name?: string; ownerType: "user" | "school"; ownerId: string }) =>
    call<{ id: string }>(
      "POST",
      "/customers",
      { email: input.email, name: input.name, metadata: { owner_type: input.ownerType, owner_id: input.ownerId } },
      `customer-${input.ownerType}-${input.ownerId}`,
    ),

  createCheckoutSession: (input: {
    customer: string;
    price: string;
    quantity: number;
    ownerType: "user" | "school";
    ownerId: string;
    trialDays?: number;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }) =>
    call<{ id: string; url: string | null }>(
      "POST",
      "/checkout/sessions",
      {
        mode: "subscription",
        customer: input.customer,
        line_items: [{ price: input.price, quantity: input.quantity }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.ownerId,
        allow_promotion_codes: true,
        metadata: { owner_type: input.ownerType, owner_id: input.ownerId },
        subscription_data: {
          metadata: { owner_type: input.ownerType, owner_id: input.ownerId },
          ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
        },
      },
      input.idempotencyKey,
    ),

  createPortalSession: (input: { customer: string; returnUrl: string }) =>
    call<{ url: string }>("POST", "/billing_portal/sessions", { customer: input.customer, return_url: input.returnUrl }),

  getSubscription: (id: string) => call<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`),

  /** Change the price and/or seat quantity. Stripe prorates; our database learns of it by webhook. */
  updateSubscriptionItem: (input: { subscriptionId: string; itemId: string; price?: string; quantity?: number; idempotencyKey: string }) =>
    call<StripeSubscription>(
      "POST",
      `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
      {
        items: [{ id: input.itemId, price: input.price, quantity: input.quantity }],
        proration_behavior: "create_prorations",
      },
      input.idempotencyKey,
    ),

  setCancelAtPeriodEnd: (input: { subscriptionId: string; cancel: boolean; idempotencyKey: string }) =>
    call<StripeSubscription>(
      "POST",
      `/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
      { cancel_at_period_end: input.cancel },
      input.idempotencyKey,
    ),

  getPrice: (id: string) => call<StripePrice>("GET", `/prices/${encodeURIComponent(id)}`),

  getCustomer: (id: string) => call<{ id: string; deleted?: boolean; name?: string | null; email?: string | null }>("GET", `/customers/${encodeURIComponent(id)}`),
};
