/**
 * One passage set for two ages, as facing columns of a hymnal page: the same
 * day, the same psalm, the same question written for each room. Sample text.
 */
const SAMPLES = [
  {
    band: "For Kindergarten to Grade 2",
    label: "Let’s talk",
    text: "When did someone wait for you to finish something?",
  },
  {
    band: "For Grades 9 to 12",
    label: "Think about it",
    text: "Where does our culture reward speed over patience, and what gets lost when it does?",
  },
] as const;

export function SameDayEveryAge() {
  return (
    <figure>
      <div className="grid border-y-4 border-double border-ink/70 md:grid-cols-2">
        {SAMPLES.map((s, i) => (
          <div key={s.band} className={`px-0 py-6 md:px-8 ${i === 1 ? "border-t border-line md:border-l md:border-t-0" : ""}`}>
            <p className="font-serif text-sm italic text-rubric">{s.band} · {s.label}</p>
            <p className="mt-3 font-serif text-2xl leading-snug text-balance md:text-[1.75rem]">{s.text}</p>
          </div>
        ))}
      </div>
      <figcaption className="mt-3 font-serif text-sm italic text-muted">
        Monday, Psalm 23, as two classes see it. Sample text written to show reading levels.
      </figcaption>
    </figure>
  );
}
