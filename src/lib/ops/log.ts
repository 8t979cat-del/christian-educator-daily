/**
 * One structured line per event, safe to ship to any log service. Values under sensitive-looking keys are
 * replaced, long strings are cut, and errors are reduced to a name, a short message and a digest, so a log
 * line cannot carry a password, a token, a prayer or an email address by accident.
 */

type Level = "debug" | "info" | "warn" | "error";
const SENSITIVE = /pass|secret|token|authorization|cookie|api[-_]?key|signature|email|phone|body|snapshot|prayer|note|message_text|details/i;
const MAX_STRING = 300;
const MAX_DEPTH = 4;

export function redact(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (value instanceof Error) return describeError(value);
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 80);
}

export function describeError(error: unknown): { name: string; message: string; digest?: string; code?: string } {
  if (error instanceof Error) {
    const e = error as Error & { digest?: unknown; code?: unknown };
    return {
      name: error.name,
      message: error.message.slice(0, MAX_STRING),
      ...(typeof e.digest === "string" ? { digest: e.digest } : {}),
      ...(typeof e.code === "string" ? { code: e.code } : {}),
    };
  }
  return { name: "NonError", message: String(error).slice(0, MAX_STRING) };
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, env: process.env.APP_ENV ?? "development", ...(redact(fields) as object) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}
