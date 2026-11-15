import { z } from "zod";

/**
 * Environment access in one place. Values are validated with zod, and blank
 * strings (as in .env.example) are treated as "not set".
 *
 * Next.js only inlines NEXT_PUBLIC_* variables when they are read as literal
 * `process.env.NAME` expressions, so each one is read explicitly below.
 */

const blank = (value: string | undefined) =>
  value && value.trim() !== "" ? value.trim() : undefined;

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function getPublicEnv(): PublicEnv {
  const result = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: blank(process.env.NEXT_PUBLIC_SITE_URL),
    NEXT_PUBLIC_SUPABASE_URL: blank(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: blank(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  });

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration (${problems}). See .env.example.`);
  }
  return result.data;
}

export function isSupabaseConfigured(): boolean {
  const env = getPublicEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Server-only secret used for privileged actions that no signed-in user may
 * perform on their own (currently: deleting an auth account). Never import
 * this from client code. Returns undefined when it is not configured.
 */
export function getServiceRoleKey(): string | undefined {
  return blank(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Shared secret that scheduled jobs present to /api/cron/*. Undefined when not configured, which disables those routes. */
export function getCronSecret(): string | undefined {
  return blank(process.env.CRON_SECRET);
}

/** Returns the Supabase settings or throws a clear error if they are missing. */
export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const env = getPublicEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

/**
 * The time zone that defines "today" for devotionals and when scheduled
 * devotionals go live. Any IANA name; invalid values fall back to the default.
 */
export function getSiteTimeZone(): string {
  const zone = blank(process.env.NEXT_PUBLIC_SITE_TIMEZONE) ?? "America/New_York";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return "America/New_York";
  }
}

/**
 * Stripe settings (server-only). Billing is "configured" only when both the API
 * key and the webhook signing secret are present, so checkout is never offered
 * without a way to hear back about payment.
 */
export function getStripeEnv(): { secretKey: string; webhookSecret: string } | undefined {
  const secretKey = blank(process.env.STRIPE_SECRET_KEY);
  const webhookSecret = blank(process.env.STRIPE_WEBHOOK_SECRET);
  return secretKey && webhookSecret ? { secretKey, webhookSecret } : undefined;
}

export const isBillingConfigured = (): boolean => Boolean(getStripeEnv());
