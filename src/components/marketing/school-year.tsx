import { Icon } from "@/components/ui/icon";

/**
 * One sample school week: five days on one theme, today highlighted, the days before it
 * done. It shows the rhythm of the year, not a schedule; the theme and titles are samples.
 */
const DAYS = [
  { day: "Mon", title: "Waiting well", state: "done" },
  { day: "Tue", title: "Patient with friends", state: "done" },
  { day: "Wed", title: "When it takes a while", state: "today" },
  { day: "Thu", title: "God is patient with us", state: "next" },
  { day: "Fri", title: "Slow to anger", state: "next" },
] as const;

export function SchoolWeek() {
  return (
    <figure className="rounded-card border border-line bg-parchment p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold">This week: Patience</p>
        <p className="text-sm text-muted">Psalm 23 and more</p>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {DAYS.map((d) => (
          <li
            key={d.day}
            aria-current={d.state === "today" ? "date" : undefined}
            className={`flex items-center gap-3 rounded-control border p-3 sm:block sm:min-h-32 ${
              d.state === "today" ? "border-brand bg-surface shadow-card" : "border-line bg-surface/70"
            }`}
          >
            <span
              aria-hidden="true"
              className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                d.state === "done" ? "bg-gilt text-ink" : d.state === "today" ? "bg-brand text-white" : "bg-line text-muted"
              }`}
            >
              {d.state === "done" ? <Icon name="check" size={16} /> : d.day.slice(0, 1)}
            </span>
            <span className="min-w-0 sm:mt-3 sm:block">
              <span className="block text-xs font-semibold uppercase text-muted">{d.day}</span>
              <span className="block font-serif leading-snug">{d.title}</span>
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-sm text-muted">A sample week. Titles are illustrations, not this week’s devotionals.</figcaption>
    </figure>
  );
}
