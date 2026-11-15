import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Stripe's `Stripe-Signature` header against the RAW request body.
 * Header form: `t=1700000000,v1=<hex>,v1=<hex>` (several v1 values appear while a secret rotates).
 * The signed text is `${t}.${rawBody}`, an HMAC-SHA256 with the endpoint's signing secret.
 * Events older than the tolerance are refused so a captured request cannot be replayed later.
 */
export type SignatureResult = { ok: true } | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
  options: { now?: Date; toleranceSeconds?: number } = {},
): SignatureResult {
  if (!header) return { ok: false, reason: "missing" };
  let timestamp: string | undefined;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) candidates.push(value.toLowerCase());
  }
  if (!timestamp || !/^\d{1,12}$/.test(timestamp) || candidates.length === 0) return { ok: false, reason: "malformed" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  const matches = candidates.some((candidate) => {
    const given = Buffer.from(candidate, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) return { ok: false, reason: "mismatch" };

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > (options.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS)) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true };
}
