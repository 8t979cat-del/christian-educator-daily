import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type {
  BillingNotice, Catalog, Engagement, Entitlements, InvoiceRow, SchoolLicense, SeatRow, SubscriptionRow,
} from "./types";

/**
 * Reads for the billing screens. They run as the signed-in person (or a visitor, for the public
 * comparison), so row-level security decides what comes back. These results are for DISPLAY:
 * authorization is enforced by the database on every actual read and write.
 */

const SUBSCRIPTION_COLUMNS =
  "id, owner_type, user_id, school_id, plan_key, plan_interval, status, seats, current_period_start, current_period_end, trial_end, cancel_at_period_end, canceled_at, ended_at";

export const getCatalog = cache(async (): Promise<Catalog> => {
  if (!isSupabaseConfigured()) return { plans: [], features: [], planFeatures: [], prices: [] };
  const supabase = await createClient();
  const [plans, features, planFeatures, prices] = await Promise.all([
    supabase.from("plans").select("key, name, tagline, audience, sort, trial_days").order("sort"),
    supabase.from("features").select("key, label, description, kind, scope, sort").order("sort"),
    supabase.from("plan_features").select("plan_key, feature_key, enabled, limit_value"),
    supabase.from("plan_prices").select("id, plan_key, plan_interval, currency, unit_amount, per_seat, active, display_note"),
  ]);
  return {
    plans: (plans.data ?? []) as Catalog["plans"],
    features: (features.data ?? []) as Catalog["features"],
    planFeatures: (planFeatures.data ?? []) as Catalog["planFeatures"],
    prices: (prices.data ?? []) as Catalog["prices"],
  };
});

export const getEntitlements = cache(async (): Promise<Entitlements> => {
  const empty: Entitlements = { plans: ["free"], features: {} };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_entitlements");
  return error || !data ? empty : (data as Entitlements);
});

/** True when the signed-in person's plans include the feature. Display only; the database enforces it. */
export async function canUse(feature: string): Promise<boolean> {
  return (await getEntitlements()).features[feature]?.enabled ?? false;
}

export const getMySubscriptions = cache(async (): Promise<SubscriptionRow[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .not("user_id", "is", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as SubscriptionRow[];
});

export async function getSchoolSubscriptions(schoolId: string): Promise<SubscriptionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  return (data ?? []) as SubscriptionRow[];
}

export async function getInvoices(owner: { schoolId?: string }): Promise<InvoiceRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("billing_invoices")
    .select("stripe_invoice_id, status, amount_due, amount_paid, currency, hosted_invoice_url, created_at")
    .order("created_at", { ascending: false })
    .limit(24);
  query = owner.schoolId ? query.eq("school_id", owner.schoolId) : query.not("user_id", "is", null);
  const { data } = await query;
  return (data ?? []) as InvoiceRow[];
}

export const getNotices = cache(async (): Promise<BillingNotice[]> => {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_billing_notices");
  return error ? [] : ((data ?? []) as BillingNotice[]);
});

export async function getSchoolLicense(schoolId: string): Promise<SchoolLicense | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("school_license", { sid: schoolId });
  return ((data ?? []) as SchoolLicense[])[0] ?? null;
}

export async function getSeatStatus(schoolId: string): Promise<SeatRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("school_seat_status", { sid: schoolId });
  return (data ?? []) as SeatRow[];
}

export async function getEngagement(schoolId: string): Promise<Engagement | { error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("school_engagement", { sid: schoolId, p_days: 30 });
  if (error) return { error: error.message };
  return data as Engagement;
}

/** For the "this is locked" cards. Titles and references only, never the body. */
export async function getLockInfo(devotionalId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("devotional_lock_info", { did: devotionalId });
  return ((data ?? []) as { id: string; title: string; devotional_date: string; scripture_reference: string; reason: "plus" | "archive" }[])[0] ?? null;
}
export async function getLockedTeasers(limit = 12, offset = 0) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("locked_teasers", { p_limit: limit, p_offset: offset });
  return (data ?? []) as { id: string; title: string; devotional_date: string; scripture_reference: string; access_level: string; reason: "plus" | "archive" }[];
}
export async function getLockedBookmarkCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_locked_bookmark_count");
  return typeof data === "number" ? data : 0;
}
