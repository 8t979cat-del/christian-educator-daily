/**
 * Returns a safe same-site path for post-login redirects. Rejects absolute
 * URLs, protocol-relative URLs ("//evil.com") and backslash tricks, which would
 * otherwise turn the "next" parameter into an open redirect.
 */
export function safeNextPath(next: unknown, fallback = "/today"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  try {
    const parsed = new URL(next, "http://localhost");
    if (parsed.origin !== "http://localhost") return fallback;
  } catch {
    return fallback;
  }
  return next;
}
