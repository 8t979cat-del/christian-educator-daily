import type { FormState } from "@/lib/auth/form-state";

/**
 * Stripe replays the stored result of an earlier request with the same idempotency key, failures
 * included. Billing keys repeat within a time window so a double-click cannot start two changes,
 * but when a form's previous attempt failed, the retry gets a fresh key so it reaches Stripe again
 * instead of replaying the old failure.
 */
export function idempotencyKey(base: string, windowMs: number, previous: FormState, now = Date.now()): string {
  const key = `${base}-${Math.floor(now / windowMs)}`;
  return previous.status === "error" ? `${key}-retry-${crypto.randomUUID()}` : key;
}
