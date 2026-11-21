/**
 * Checks an environment BEFORE it is used, so a wrong configuration is caught on a developer's machine or in CI
 * rather than by a school. Pure and dependency-free: it runs inside the app (the launch page) and from
 * `npm run check:env` against a file. It reports names and verdicts and NEVER prints a value.
 */

export type AppEnvironment = "development" | "staging" | "production";
export type CheckLevel = "ok" | "warning" | "error";
export type EnvCheck = { key: string; level: CheckLevel; message: string };
export type EnvReport = { environment: AppEnvironment | "unknown"; checks: EnvCheck[]; errors: number; warnings: number; ok: boolean };

type Env = Record<string, string | undefined>;

const has = (v: string | undefined): v is string => typeof v === "string" && v.trim() !== "";

/** The payload of a JWT-style Supabase key, or undefined if it is not one. Never throws. */
function jwtRole(key: string): string | undefined {
  const part = key.split(".")[1];
  if (!part) return undefined;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { role?: unknown };
    return typeof json.role === "string" ? json.role : undefined;
  } catch {
    return undefined;
  }
}

export function checkEnvironment(env: Env): EnvReport {
  const checks: EnvCheck[] = [];
  const add = (key: string, level: CheckLevel, message: string) => checks.push({ key, level, message });

  const raw = env.APP_ENV?.trim();
  const environment: AppEnvironment | "unknown" = raw === "development" || raw === "staging" || raw === "production" ? raw : "unknown";
  const strict = environment === "staging" || environment === "production";
  const prod = environment === "production";

  if (environment === "unknown") add("APP_ENV", strict ? "error" : "error", "Set APP_ENV to development, staging or production so the app knows which environment it is.");
  else add("APP_ENV", "ok", `Running as ${environment}.`);

  // Site URL
  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!has(site)) add("NEXT_PUBLIC_SITE_URL", strict ? "error" : "warning", "Not set. Links in emails and metadata need the real address.");
  else {
    let url: URL | undefined;
    try { url = new URL(site); } catch { /* reported below */ }
    if (!url) add("NEXT_PUBLIC_SITE_URL", "error", "Not a valid URL.");
    else if (strict && url.protocol !== "https:") add("NEXT_PUBLIC_SITE_URL", "error", "Must use https in staging and production.");
    else if (strict && /^(localhost|127\.|0\.0\.0\.0)/.test(url.hostname)) add("NEXT_PUBLIC_SITE_URL", "error", "Points at this machine, not a real domain.");
    else add("NEXT_PUBLIC_SITE_URL", "ok", "Set.");
  }

  // Supabase
  const sbUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!has(sbUrl) || !has(anon)) add("SUPABASE", strict ? "error" : "warning", "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required; without them nobody can sign in.");
  else {
    if (strict && !sbUrl.startsWith("https://")) add("NEXT_PUBLIC_SUPABASE_URL", "error", "Must be an https project URL.");
    else add("NEXT_PUBLIC_SUPABASE_URL", "ok", "Set.");
    if (jwtRole(anon) === "service_role" || anon.startsWith("sb_secret_")) add("NEXT_PUBLIC_SUPABASE_ANON_KEY", "error", "This is a SERVICE key. It bypasses all security and must never be public. Use the anon/publishable key here.");
    else add("NEXT_PUBLIC_SUPABASE_ANON_KEY", "ok", "Set, and not a service key.");
  }
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!has(service)) add("SUPABASE_SERVICE_ROLE_KEY", prod ? "error" : "warning", "Not set. Account deletion, billing webhooks and the retention job need it.");
  else if (jwtRole(service) === "anon" || service.startsWith("sb_publishable_")) add("SUPABASE_SERVICE_ROLE_KEY", "error", "This is the public key, not the service key.");
  else add("SUPABASE_SERVICE_ROLE_KEY", "ok", "Set (server-only).");

  // Secrets must never be exposed to the browser
  const exposed = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE|PRIVATE|WEBHOOK|PASSWORD|TOKEN/i.test(k));
  if (exposed.length) add("NEXT_PUBLIC_*", "error", `These public variables look like secrets and would be sent to every browser: ${exposed.join(", ")}.`);
  else add("NEXT_PUBLIC_*", "ok", "No public variable looks like a secret.");

  // Stripe: test credentials never in production; live credentials never in staging.
  const sk = env.STRIPE_SECRET_KEY?.trim();
  const wh = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!has(sk) && !has(wh)) add("STRIPE", "warning", "Not configured: checkout is closed and the app says so. Correct for a pilot that does not charge yet.");
  else if (!has(sk) || !has(wh)) add("STRIPE", "error", "Only one of STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET is set. Checkout needs both.");
  else {
    const live = /^(sk|rk)_live_/.test(sk);
    const test = /^(sk|rk)_test_/.test(sk);
    if (!live && !test) add("STRIPE_SECRET_KEY", "error", "Does not look like a Stripe secret key.");
    else if (prod && test) add("STRIPE_SECRET_KEY", "error", "A TEST key in production. Real payments would not work and test data would mix with live.");
    else if (!prod && environment !== "unknown" && live) add("STRIPE_SECRET_KEY", "error", "A LIVE key outside production. Use a test key here.");
    else add("STRIPE_SECRET_KEY", "ok", live ? "Live key (production)." : "Test key.");
    add("STRIPE_WEBHOOK_SECRET", /^whsec_/.test(wh) ? "ok" : "error", /^whsec_/.test(wh) ? "Set." : "Should start with whsec_.");
  }

  // Scheduled jobs
  const cron = env.CRON_SECRET?.trim();
  if (!has(cron)) add("CRON_SECRET", prod ? "error" : "warning", "Not set: the daily retention job cannot run, so retention rules would not be applied.");
  else if (cron.length < 32) add("CRON_SECRET", "error", "Too short. Use at least 32 random characters.");
  else add("CRON_SECRET", "ok", "Set.");

  // Monitoring
  const report = env.ERROR_REPORT_URL?.trim();
  if (!has(report)) add("ERROR_REPORT_URL", prod ? "error" : "warning", "No error reporting destination. Errors would appear only in host logs, and nobody would be told.");
  else if (!report.startsWith("https://")) add("ERROR_REPORT_URL", "error", "Must be an https URL.");
  else add("ERROR_REPORT_URL", "ok", "Set.");

  // Time zone: fixed to Pacific Time in code (src/lib/env.ts); a host setting no longer applies.
  const tz = env.NEXT_PUBLIC_SITE_TIMEZONE?.trim();
  if (has(tz) && tz !== "America/Los_Angeles") add("NEXT_PUBLIC_SITE_TIMEZONE", "warning", `Set to ${tz}, but the site always uses Pacific Time (America/Los_Angeles). You can delete this setting.`);
  else add("NEXT_PUBLIC_SITE_TIMEZONE", "ok", "The site uses Pacific Time (America/Los_Angeles).");

  const errors = checks.filter((c) => c.level === "error").length;
  const warnings = checks.filter((c) => c.level === "warning").length;
  return { environment, checks, errors, warnings, ok: errors === 0 };
}
