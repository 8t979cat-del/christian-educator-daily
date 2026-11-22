import Link from "next/link";
import { SITE } from "@/lib/site";

/** The mark: an open Bible on a classroom-blue tile, with a gold ribbon marking today's page. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 36 36" className="shrink-0">
      <rect width="36" height="36" rx="9" fill="#2350cc" />
      <path d="M18 11.5c-2.6-1.7-5.7-2.3-9-2v15c3.3-.3 6.4.3 9 2 2.6-1.7 5.7-2.3 9-2v-15c-3.3-.3-6.4.3-9 2Z" fill="#fff" />
      <path d="M18 11.5v15" stroke="#2350cc" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M11.5 14.2c1.8 0 3.4.4 4.6 1M11.5 17.4c1.8 0 3.4.4 4.6 1M20 15.2c1.2-.6 2.8-1 4.5-1" stroke="#b9c8ef" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M22.5 9.6v8.6l1.7-1.4 1.7 1.4V9.9" fill="#f2b23a" />
    </svg>
  );
}

/** The wordmark: the mark beside "Everyday Devotional" set in Lexend. */
export function Logo({ compact = false, onDark = false }: { compact?: boolean; onDark?: boolean }) {
  return (
    <Link href="/" className={`inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-control ${onDark ? "text-white" : "text-ink"}`} aria-label={`${SITE.name} home`}>
      <LogoMark />
      {compact ? null : (
        <span className="min-w-0 text-[1.05rem] font-semibold leading-tight tracking-[-0.01em]">
          {SITE.wordmark}
        </span>
      )}
    </Link>
  );
}
