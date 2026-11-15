import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkEnvironment } from "@/lib/ops/env-check";
import { describeError, log, redact } from "@/lib/ops/log";
import { reportError, resetReportLimiter } from "@/lib/ops/report";

const jwt = (role: string) => `h.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.s`;
const good = {
  APP_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://www.example.org", NEXT_PUBLIC_SITE_TIMEZONE: "America/Chicago",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"), SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
  STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_WEBHOOK_SECRET: "whsec_abc", CRON_SECRET: "x".repeat(40), ERROR_REPORT_URL: "https://hooks.example.org/e",
};
const level = (env: Record<string, string | undefined>, key: string) => checkEnvironment(env).checks.filter((c) => c.key === key).map((c) => c.level);

describe("environment check", () => {
  it("accepts a complete production configuration", () => {
    const r = checkEnvironment(good);
    expect(r.errors, JSON.stringify(r.checks.filter((c) => c.level !== "ok"))).toBe(0);
    expect(r.ok).toBe(true);
  });
  it("refuses test payment credentials in production, and live ones outside it", () => {
    expect(level({ ...good, STRIPE_SECRET_KEY: "sk_test_abc" }, "STRIPE_SECRET_KEY")).toEqual(["error"]);
    expect(level({ ...good, APP_ENV: "staging" }, "STRIPE_SECRET_KEY")).toEqual(["error"]);
    expect(level({ ...good, APP_ENV: "staging", STRIPE_SECRET_KEY: "sk_test_abc" }, "STRIPE_SECRET_KEY")).toEqual(["ok"]);
  });
  it("allows production with billing not configured (a pilot that does not charge yet), but not half-configured", () => {
    const none = { ...good, STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined };
    expect(level(none, "STRIPE")).toEqual(["warning"]);
    expect(checkEnvironment(none).ok).toBe(true);
    expect(level({ ...good, STRIPE_WEBHOOK_SECRET: undefined }, "STRIPE")).toEqual(["error"]);
  });
  it("catches a service key placed in the public slot, and the public key in the service slot", () => {
    expect(level({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("service_role") }, "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toEqual(["error"]);
    expect(level({ ...good, NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_abc" }, "NEXT_PUBLIC_SUPABASE_ANON_KEY")).toEqual(["error"]);
    expect(level({ ...good, SUPABASE_SERVICE_ROLE_KEY: jwt("anon") }, "SUPABASE_SERVICE_ROLE_KEY")).toEqual(["error"]);
  });
  it("catches secrets exposed through NEXT_PUBLIC_ names", () => {
    expect(level({ ...good, NEXT_PUBLIC_STRIPE_SECRET: "x" }, "NEXT_PUBLIC_*")).toEqual(["error"]);
  });
  it("requires https, a real domain, a long cron secret and an error destination in production", () => {
    expect(level({ ...good, NEXT_PUBLIC_SITE_URL: "http://www.example.org" }, "NEXT_PUBLIC_SITE_URL")).toEqual(["error"]);
    expect(level({ ...good, NEXT_PUBLIC_SITE_URL: "https://localhost:3000" }, "NEXT_PUBLIC_SITE_URL")).toEqual(["error"]);
    expect(level({ ...good, CRON_SECRET: "short" }, "CRON_SECRET")).toEqual(["error"]);
    expect(level({ ...good, CRON_SECRET: undefined }, "CRON_SECRET")).toEqual(["error"]);
    expect(level({ ...good, ERROR_REPORT_URL: undefined }, "ERROR_REPORT_URL")).toEqual(["error"]);
    expect(level({ ...good, SUPABASE_SERVICE_ROLE_KEY: undefined }, "SUPABASE_SERVICE_ROLE_KEY")).toEqual(["error"]);
    expect(level({ ...good, NEXT_PUBLIC_SITE_TIMEZONE: "Mars/Base" }, "NEXT_PUBLIC_SITE_TIMEZONE")).toEqual(["error"]);
    expect(checkEnvironment({ ...good, APP_ENV: undefined }).ok).toBe(false);
  });
  it("is relaxed in development", () => {
    const r = checkEnvironment({ APP_ENV: "development" });
    expect(r.ok).toBe(true);
    expect(r.warnings).toBeGreaterThan(0);
  });
  it("never repeats a value in its output", () => {
    const text = JSON.stringify(checkEnvironment({ ...good, STRIPE_SECRET_KEY: "sk_live_SUPERSECRETVALUE", CRON_SECRET: "CRONSECRET".repeat(5) }));
    expect(text).not.toContain("SUPERSECRETVALUE");
    expect(text).not.toContain("CRONSECRET");
    expect(text).not.toContain(good.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  });
});

describe("logging", () => {
  it("redacts sensitive keys, trims long text and reduces errors", () => {
    const out = redact({ password: "p", authToken: "t", email: "a@b.c", body: "my prayer", note: "n", code: "42P01", nested: { apiKey: "k", ok: 1 }, long: "x".repeat(900), err: new Error("boom") }) as Record<string, any>;
    expect(out.password).toBe("[redacted]");
    expect(out.authToken).toBe("[redacted]");
    expect(out.email).toBe("[redacted]");
    expect(out.body).toBe("[redacted]");
    expect(out.nested.apiKey).toBe("[redacted]");
    expect(out.nested.ok).toBe(1);
    expect(out.code).toBe("42P01");
    expect(out.long.length).toBeLessThan(310);
    expect(out.err).toEqual({ name: "Error", message: "boom" });
  });
  it("writes one JSON line carrying the environment", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "hello", { secret: "s", n: 1 });
    const line = JSON.parse(String(spy.mock.calls[0]![0]));
    expect(line).toMatchObject({ level: "info", event: "hello", n: 1, secret: "[redacted]" });
    spy.mockRestore();
  });
  it("describes non-errors safely", () => {
    expect(describeError("plain")).toEqual({ name: "NonError", message: "plain" });
  });
});

describe("error reporting", () => {
  const env = { ...process.env };
  beforeEach(() => { resetReportLimiter(); vi.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => { process.env = { ...env }; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("sends a sanitised report and nothing else", async () => {
    process.env.ERROR_REPORT_URL = "https://hooks.example.org/e";
    process.env.ERROR_REPORT_TOKEN = "tok";
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const err = Object.assign(new Error("db exploded for pat@example.com"), { digest: "d123" });
    const r = await reportError(err, { path: "/community/groups/abc?token=SECRET&email=a@b.c", method: "POST", routeType: "action" });
    expect(r).toEqual({ delivered: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example.org/e");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const sent = String(init.body);
    expect(sent).toContain("d123");
    expect(sent).toContain("/community/groups/abc");
    expect(sent).not.toContain("SECRET");
    expect(sent).not.toContain("token=");
    expect(JSON.parse(sent).error).not.toHaveProperty("stack");
  });
  it("does nothing risky without a destination, and never throws", async () => {
    delete process.env.ERROR_REPORT_URL;
    expect(await reportError(new Error("x"))).toEqual({ delivered: false, reason: "no_destination" });
    process.env.ERROR_REPORT_URL = "http://insecure.example.org";
    expect(await reportError(new Error("x"))).toEqual({ delivered: false, reason: "no_destination" });
    process.env.ERROR_REPORT_URL = "https://hooks.example.org/e";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await reportError(new Error("x"))).toEqual({ delivered: false, reason: "network" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    expect(await reportError(new Error("x"))).toEqual({ delivered: false, reason: "http_500" });
  });
  it("caps its own volume", async () => {
    process.env.ERROR_REPORT_URL = "https://hooks.example.org/e";
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const results = [];
    for (let i = 0; i < 30; i++) results.push(await reportError(new Error("loop")));
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(results.filter((r) => r.reason === "rate_limited")).toHaveLength(10);
  });
});
