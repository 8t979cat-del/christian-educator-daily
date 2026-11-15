import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/billing/signature";
import { getStripeEnv } from "@/lib/env";
import { log } from "@/lib/ops/log";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook. This is the ONLY way subscription state changes.
 *   1. Read the raw body (the signature covers the exact bytes).
 *   2. Verify the signature and timestamp; anything else is rejected before parsing.
 *   3. Hand the event to billing_apply_event(), which is idempotent and order-aware.
 * 2xx tells Stripe to stop; a 5xx makes it retry, which is what we want when something
 * (like a customer link) has not arrived yet.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const env = getStripeEnv();
  if (!env) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });

  const raw = await request.text();
  const verdict = verifyStripeSignature(raw, request.headers.get("stripe-signature"), env.webhookSecret);
  if (!verdict.ok) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Server is not configured." }, { status: 503 });

  const { data, error } = await admin.rpc("billing_apply_event", { p_event: event });
  if (error) {
    // Malformed events will never succeed; everything else may on retry.
    const permanent = error.code === "22023";
    log("error", "billing_apply_event_failed", { code: error.code, message: error.message, permanent });
    return NextResponse.json({ error: "Could not apply event." }, { status: permanent ? 400 : 500 });
  }
  return NextResponse.json({ received: true, outcome: data });
}
