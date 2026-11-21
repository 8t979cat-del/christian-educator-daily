import type { NextConfig } from "next";

/**
 * Content-Security-Policy. Next.js emits small inline scripts for hydration, so script-src needs
 * 'unsafe-inline' unless a per-request nonce is introduced (a known follow-up, see docs/QA-AUDIT.md).
 * Everything else is closed: no plugins, no framing, no foreign form targets, connections only to this
 * site and the configured Supabase project. User-generated text is never rendered as HTML, so this is a
 * second layer, not the first.
 */
function contentSecurityPolicy(): string {
  const dev = process.env.NODE_ENV !== "production";
  let supabase = "";
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url) {
      const u = new URL(url);
      supabase = ` ${u.origin} ${u.protocol === "https:" ? "wss" : "ws"}://${u.host}`;
    }
  } catch {
    /* an unusable URL simply adds nothing */
  }
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${supabase}${dev ? " ws: http:" : ""}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const securityHeaders = (): { key: string; value: string }[] => [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Only meaningful over HTTPS; browsers ignore it on plain HTTP.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The bundled public-domain Bible (read with fs when AI writes a devotional) must ship with the server code.
  outputFileTracingIncludes: { "/**": ["./data/kjv.json", "./data/web.json", "./data/asv.json"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  async redirects() {
    // Pricing is not set during the founding-school pilot, so there is no pricing page. Old links,
    // including "Compare plans" on the (switched-off) upgrade screen, go to the founding-schools section.
    // Temporary, so browsers do not remember it once a pricing page returns.
    return [{ source: "/pricing", destination: "/#founding", permanent: false }];
  },
};

export default nextConfig;
