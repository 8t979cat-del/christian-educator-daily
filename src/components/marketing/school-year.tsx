/**
 * 180 days drawn as the school year runs: 36 weeks of Monday to Friday. Each
 * week is one theme, so the weeks are grouped. It shows the scale of the
 * sequence, not a schedule or any real content.
 */
const WEEKS = 36;

export function SchoolYear() {
  return (
    <figure>
      <div
        role="img"
        aria-label="180 school days: 36 weeks of Monday to Friday"
        className="grid grid-cols-6 gap-x-2.5 gap-y-3 sm:grid-cols-9"
      >
        {Array.from({ length: WEEKS }, (_, w) => (
          <div key={w} className="grid grid-cols-5 gap-[3px]">
            {Array.from({ length: 5 }, (_, d) => (
              <span key={d} className={`block h-5 rounded-[2px] ${w === 0 ? "bg-brand" : "bg-brand/20"}`} />
            ))}
          </div>
        ))}
      </div>
      <figcaption className="mt-3 flex justify-between text-sm text-muted">
        <span>Week 1</span>
        <span>Week 36</span>
      </figcaption>
    </figure>
  );
}
