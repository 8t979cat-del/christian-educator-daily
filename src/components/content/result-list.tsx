import Link from "next/link";
import { formatDate } from "@/lib/content/dates";
import { categoryName } from "@/lib/content/options";
import type { SearchHit } from "@/lib/content/types";
import { StatusBadge } from "./status-badge";
import { Icon } from "@/components/ui/icon";

/** A list of devotionals. Editors see status; readers do not (everything they see is live). */
export function ResultList({ hits, hrefFor, showStatus, states, faculty }: {
  hits: SearchHit[];
  hrefFor: (id: string) => string;
  showStatus?: boolean;
  states?: Map<string, { bookmarked: boolean; completed_at: string | null }>;
  /** Devotionals written for the faculty: a gold edge and a small "For faculty" tag, otherwise the same card. */
  faculty?: Set<string>;
}) {
  return (
    <ul className="grid gap-3">
      {hits.map((hit) => {
        const forFaculty = faculty?.has(hit.id) ?? false;
        return (
        <li key={hit.id}>
          <Link
            href={hrefFor(hit.id)}
            className={`block rounded-card border border-line bg-surface p-5 transition-colors hover:border-brand hover:bg-brand-soft/40 ${forFaculty ? "border-l-4 border-l-gilt" : ""}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {forFaculty ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-ink">
                  <Icon name="users" size={14} />
                  For faculty
                </span>
              ) : null}
              <span className="font-semibold text-brand">{formatDate(hit.devotional_date, "short")}</span>
              <span>{categoryName(hit.category_slug)}</span>
              {hit.scripture_reference ? <span>{hit.scripture_reference}</span> : null}
              {showStatus ? <StatusBadge status={hit.status} /> : null}
              {states?.get(hit.id)?.completed_at ? <span className="font-semibold text-brand">✓ Completed</span> : null}
              {states?.get(hit.id)?.bookmarked ? <span className="font-semibold text-brand">Saved</span> : null}
            </div>
            <h3 className="mt-1 font-serif text-xl font-semibold">{hit.title || "Untitled devotional"}</h3>
            {hit.daily_topic ? <p className="mt-0.5 text-muted">{hit.daily_topic}</p> : null}
            {hit.excerpt ? <p className="mt-2 line-clamp-2 text-ink/80">{hit.excerpt}</p> : null}
            {showStatus && hit.author_name ? <p className="mt-2 text-sm text-muted">By {hit.author_name}</p> : null}
          </Link>
        </li>
        );
      })}
    </ul>
  );
}
