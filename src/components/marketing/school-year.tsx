/**
 * The school year as a hymnal's index: thirty-six weeks, five days each, every
 * day numbered from 1 to 180 the way a hymnal numbers its hymns. It shows the
 * shape of the sequence, not a schedule or any real content.
 */
const WEEKS = 36;

export function SchoolYear() {
  return (
    <figure>
      <ol aria-label="180 school days in 36 weeks" className="grid grid-cols-2 gap-x-8 font-serif sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: WEEKS }, (_, w) => (
          <li key={w} className="flex items-baseline gap-2 border-b border-line py-1.5 text-sm">
            <span className="w-14 shrink-0 italic text-muted">Week {w + 1}</span>
            <span aria-hidden="true" className="min-w-2 flex-1 translate-y-[-0.2em] border-b border-dotted border-line-strong/50" />
            <span className={`tabular-nums [font-variant-numeric:oldstyle-nums_tabular-nums] ${w === 0 ? "text-rubric" : "text-ink"}`}>
              {w * 5 + 1}–{w * 5 + 5}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
