import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * The wordmark, stamped like a hymnal spine: the "180" in a ruled label, then the
 * name in spaced capitals. `onCloth` sets it in gilt on the navy bookcloth masthead.
 */
export function Logo({ compact = false, onCloth = false }: { compact?: boolean; onCloth?: boolean }) {
  const ink = onCloth ? "text-gilt" : "text-brand";
  return (
    <Link href="/" className={`inline-flex min-h-11 min-w-0 items-center gap-3 rounded-control ${ink}`} aria-label={`${SITE.name} home`}>
      <span aria-hidden="true" className="grid min-h-9 shrink-0 place-items-center border border-current px-1.5 font-serif text-[0.95rem] leading-none tabular-nums [font-variant-numeric:oldstyle-nums]">
        <span className="border-y border-current px-1 py-1">{SITE.mark}</span>
      </span>
      {compact ? null : (
        <span className="min-w-0 font-serif text-[0.95rem] uppercase leading-tight tracking-[0.1em] [overflow-wrap:anywhere] sm:tracking-[0.18em]">
          {SITE.wordmark}
          <span className="sr-only">: 180 Days</span>
        </span>
      )}
    </Link>
  );
}
