import Link from "next/link";
import { SITE } from "@/lib/site";

/** Wordmark. A simple text mark until a brand identity is commissioned. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 rounded-control" aria-label={`${SITE.name} home`}>
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-brand font-serif text-sm font-bold text-white"
      >
        {SITE.shortName.slice(0, 2)}
      </span>
      {compact ? null : <span className="font-serif text-lg font-semibold leading-none">{SITE.name}</span>}
    </Link>
  );
}
