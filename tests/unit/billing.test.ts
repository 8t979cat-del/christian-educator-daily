import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { annualSavingsPercent, describeSubscription, formatMoney, noticeText, priceLabel } from "@/lib/billing/format";
import { verifyStripeSignature } from "@/lib/billing/signature";
import { encodeForm, stripe, STRIPE_API_VERSION, StripeError } from "@/lib/billing/stripe";
import type { PlanPrice, SubscriptionRow } from "@/lib/billing/types";

const SECRET = "whsec_test_secret";
const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
const sign = (raw: string, t: number, secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
const NOW = new Date("2026-11-14T12:00:00Z");
const T = Math.floor(NOW.getTime() / 1000);

describe("webhook signature verification", () => {
  it("accepts a correctly signed, fresh body", () => {
    expect(verifyStripeSignature(body, sign(body, T), SECRET, { now: NOW })).toEqual({ ok: true });
  });
  it("accepts any matching v1 while a secret is rotating", () => {
    const good = sign(body, T).split(",")[1]!;
    const header = `t=${T},v1=${"0".repeat(64)},${good}`;
    expect(verifyStripeSignature(body, header, SECRET, { now: NOW }).ok).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifyStripeSignature(body, sign(body, T, "whsec_other"), SECRET, { now: NOW })).toEqual({ ok: false, reason: "mismatch" });
  });
  it("rejects a tampered body", () => {
    expect(verifyStripeSignature(body.replace("paid", "void"), sign(body, T), SECRET, { now: NOW })).toEqual({ ok: false, reason: "mismatch" });
  });
  it("rejects a tampered timestamp", () => {
    const header = sign(body, T).replace(`t=${T}`, `t=${T + 1}`);
    expect(verifyStripeSignature(body, header, SECRET, { now: NOW }).ok).toBe(false);
  });
  it("rejects a replay outside the tolerance, and accepts just inside it", () => {
    expect(verifyStripeSignature(body, sign(body, T - 301), SECRET, { now: NOW })).toEqual({ ok: false, reason: "stale" });
    expect(verifyStripeSignature(body, sign(body, T - 299), SECRET, { now: NOW }).ok).toBe(true);
    expect(verifyStripeSignature(body, sign(body, T + 301), SECRET, { now: NOW })).toEqual({ ok: false, reason: "stale" });
  });
  it("rejects missing and malformed headers", () => {
    expect(verifyStripeSignature(body, null, SECRET, { now: NOW })).toEqual({ ok: false, reason: "missing" });
    expect(verifyStripeSignature(body, "", SECRET, { now: NOW })).toEqual({ ok: false, reason: "missing" });
    for (const header of ["garbage", `t=${T}`, `v1=${"a".repeat(64)}`, `t=abc,v1=${"a".repeat(64)}`, `t=${T},v1=short`]) {
      expect(verifyStripeSignature(body, header, SECRET, { now: NOW }), header).toEqual({ ok: false, reason: "malformed" });
    }
  });
  it("is not fooled by an empty secret or by signing something else", () => {
    expect(verifyStripeSignature(body, sign("other", T), SECRET, { now: NOW }).ok).toBe(false);
    expect(verifyStripeSignature(body, sign(body, T, ""), SECRET, { now: NOW }).ok).toBe(false);
  });
});

describe("Stripe client", () => {
  const calls: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "obj_1", url: "https://checkout.stripe.com/c/1" }), { status: 200 });
    }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("encodes nested values with bracket notation and skips empty ones", () => {
    expect(decodeURIComponent(encodeForm({ mode: "subscription", line_items: [{ price: "p1", quantity: 3 }], metadata: { a: "b c" }, skip: undefined, none: null })))
      .toBe("mode=subscription&line_items[0][price]=p1&line_items[0][quantity]=3&metadata[a]=b c");
  });

  it("creates a checkout session for one owner, with a trial only when asked and an idempotency key", async () => {
    await stripe.createCheckoutSession({ customer: "cus_1", price: "price_1", quantity: 1, ownerType: "user", ownerId: "u1", trialDays: 14, successUrl: "https://x/s", cancelUrl: "https://x/c", idempotencyKey: "k1" });
    const { url, init } = calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test_123");
    expect(headers["Idempotency-Key"]).toBe("k1");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price]")).toBe("price_1");
    expect(form.get("subscription_data[trial_period_days]")).toBe("14");
    expect(form.get("subscription_data[metadata][owner_id]")).toBe("u1");
    expect(form.get("metadata[owner_type]")).toBe("user");
    await stripe.createCheckoutSession({ customer: "cus_1", price: "price_1", quantity: 1, ownerType: "user", ownerId: "u1", successUrl: "https://x/s", cancelUrl: "https://x/c", idempotencyKey: "k2" });
    expect(new URLSearchParams(String(calls[1]!.init.body)).has("subscription_data[trial_period_days]")).toBe(false);
  });

  it("pins the API version on every request, reads and writes alike", async () => {
    await stripe.getCustomer("cus_1");
    await stripe.createPortalSession({ customer: "cus_1", returnUrl: "https://x/r" });
    for (const { init } of calls) expect((init.headers as Record<string, string>)["Stripe-Version"]).toBe(STRIPE_API_VERSION);
    expect(STRIPE_API_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.[a-z]+$/);
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/customers/cus_1");
  });

  it("changes seats with proration and reads subscriptions with GET", async () => {
    await stripe.updateSubscriptionItem({ subscriptionId: "sub_1", itemId: "si_1", quantity: 12, idempotencyKey: "k" });
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/subscriptions/sub_1");
    expect(form.get("items[0][quantity]")).toBe("12");
    expect(form.get("proration_behavior")).toBe("create_prorations");
    await stripe.getSubscription("sub_1");
    expect(calls[1]!.init.method).toBe("GET");
    expect(calls[1]!.init.body).toBeUndefined();
  });

  it("turns an API error into a StripeError without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "No such price", code: "resource_missing" } }), { status: 404 })));
    const err = await stripe.getPrice("price_x").catch((e) => e);
    expect(err).toBeInstanceOf(StripeError);
    expect(err).toMatchObject({ status: 404, code: "resource_missing", message: "No such price" });
    expect(JSON.stringify(err)).not.toContain("sk_test");
  });

  it("refuses to call Stripe when billing is not configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(stripe.getPrice("price_x")).rejects.toMatchObject({ code: "not_configured" });
    expect(calls).toHaveLength(0);
  });
});

describe("pricing display", () => {
  const price = (over: Partial<PlanPrice>): PlanPrice => ({ id: "1", plan_key: "plus", plan_interval: "month", currency: "usd", unit_amount: 800, per_seat: false, active: true, display_note: "", ...over });
  it("formats amounts from configured data, never from code", () => {
    expect(formatMoney(800, "usd")).toBe("$8.00");
    expect(formatMoney(null, "usd")).toBeNull();
    expect(priceLabel(price({}))).toBe("$8.00 / month");
    expect(priceLabel(price({ per_seat: true, plan_interval: "year", unit_amount: 4000 }))).toBe("$40.00 / seat / year");
    expect(priceLabel(price({ active: false }))).toBeNull();
    expect(priceLabel(undefined)).toBeNull();
  });
  it("shows annual savings only when both prices are known", () => {
    expect(annualSavingsPercent(price({}), price({ plan_interval: "year", unit_amount: 8000 }))).toBe(17);
    expect(annualSavingsPercent(price({}), price({ plan_interval: "year", unit_amount: 9600 }))).toBeNull();
    expect(annualSavingsPercent(price({}), undefined)).toBeNull();
  });
});

describe("status and notice wording", () => {
  const sub = (over: Partial<SubscriptionRow>): SubscriptionRow => ({
    id: "1", owner_type: "user", user_id: "u", school_id: null, plan_key: "plus", plan_interval: "year", status: "active", seats: 1,
    current_period_start: null, current_period_end: "2027-03-01T00:00:00Z", trial_end: null, cancel_at_period_end: false, canceled_at: null, ended_at: null, ...over,
  });
  it("describes each state calmly and truthfully", () => {
    expect(describeSubscription(sub({}), NOW)).toMatchObject({ label: "Active", tone: "positive" });
    expect(describeSubscription(sub({ cancel_at_period_end: true }), NOW).detail).toMatch(/keep full access/);
    expect(describeSubscription(sub({ status: "past_due" }), NOW)).toMatchObject({ label: "Payment needed", tone: "attention" });
    expect(describeSubscription(sub({ status: "canceled" }), NOW).detail).toMatch(/still yours/);
    expect(describeSubscription(sub({ status: "trialing", cancel_at_period_end: true }), NOW).detail).toMatch(/will not renew/);
  });
  it("words every notice code the database can produce, and ignores unknown ones", () => {
    for (const kind of ["trial_ending", "cancels_on", "payment_failed", "expired", "school_no_seat", "school_seat_over_limit", "school_lapsed",
      "school_payment_failed", "school_cancels_on", "school_trial_ending", "school_out_of_seats"]) {
      expect(noticeText(kind, "Grace Academy", "2026-12-01T00:00:00Z"), kind).not.toBeNull();
    }
    expect(noticeText("mystery", null, null)).toBeNull();
  });
});
