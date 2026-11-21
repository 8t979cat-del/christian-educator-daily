import Link from "next/link";
import { SITE } from "@/lib/site";

/** Wordmark: the "180" mark with "Everyday Devotional". A simple text lockup until a brand identity is commissioned. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-control" aria-label={`${SITE.name} home`}>
      <span
        aria-hidden="true"
        className="grid h-8 min-w-10 shrink-0 place-items-center rounded-lg bg-brand px-1.5 font-serif text-sm font-semibold tabular-nums text-white"
      >
        {SITE.mark}
      </span>
      {compact ? null : (
        <span className="min-w-0 font-serif text-lg font-semibold leading-tight">
          {SITE.wordmark}
          <span className="sr-only">: 180 Days</span>
        </span>
      )}
    </Link>
  );
}
