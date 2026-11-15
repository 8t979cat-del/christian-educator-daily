import { describeError, log } from "./log";

/**
 * Sends a SANITISED error report to the destination in ERROR_REPORT_URL (any HTTPS endpoint that accepts JSON:
 * a chat webhook, an incident tool, a small relay to a monitoring vendor). It sends the error's name, short message,
 * digest, route and time. It never sends request bodies, headers, cookies, query strings or people's content.
 * It never throws, never waits more than a few seconds, and caps its own volume so a failing page cannot flood
 * the destination. With no URL set it only writes a log line, and says so.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let windowStart = 0;
let sent = 0;

export function resetReportLimiter() { windowStart = 0; sent = 0; }

export type ErrorContext = { path?: string; method?: string; routeType?: string; routePath?: string };

const cleanPath = (p?: string) => (p ? p.split("?")[0]!.slice(0, 200) : undefined);

export async function reportError(error: unknown, context: ErrorContext = {}): Promise<{ delivered: boolean; reason?: string }> {
  const info = describeError(error);
  const payload = {
    service: "christian-educator-daily",
    environment: process.env.APP_ENV ?? "development",
    release: (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RELEASE ?? "").slice(0, 12) || undefined,
    at: new Date().toISOString(),
    error: info,
    path: cleanPath(context.path),
    method: context.method,
    routeType: context.routeType,
    routePath: context.routePath,
  };
  log("error", "unhandled_error", payload);

  const url = process.env.ERROR_REPORT_URL?.trim();
  if (!url || !url.startsWith("https://")) return { delivered: false, reason: "no_destination" };

  const now = Date.now();
  if (now - windowStart > WINDOW_MS) { windowStart = now; sent = 0; }
  if (sent >= MAX_PER_WINDOW) return { delivered: false, reason: "rate_limited" };
  sent++;

  try {
    const token = process.env.ERROR_REPORT_TOKEN?.trim();
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? { delivered: true } : { delivered: false, reason: `http_${response.status}` };
  } catch {
    return { delivered: false, reason: "network" };
  }
}
