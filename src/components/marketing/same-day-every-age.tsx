/**
 * One passage written for two ages, side by side: the same day, the same psalm, the same
 * question written for each class. Sample text.
 */
const SAMPLES = [
  { band: "K–2", long: "Kindergarten to grade 2", text: "When did someone wait for you to finish something?" },
  { band: "9–12", long: "Grades 9 to 12", text: "Where does our culture reward speed over patience, and what gets lost when it does?" },
] as const;

export function SameDayEveryAge() {
  return (
    <figure>
      <div className="grid gap-4 md:grid-cols-2">
        {SAMPLES.map((s) => (
          // Written on the rules: the label row and each line of the question are 2rem.
          <div key={s.band} className="workbook-paper rounded-card border border-line px-6 pb-8 pt-8 shadow-card sm:pl-16">
            <p className="flex h-8 flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-brand px-2.5 py-0.5 font-semibold leading-5 text-white">{s.band}</span>
              <span className="text-muted">{s.long} · Talk</span>
            </p>
            <p className="font-serif text-[1.5rem] leading-8 text-balance">{s.text}</p>
          </div>
        ))}
      </div>
      <figcaption className="mt-3 text-sm text-muted">
        Monday, Psalm 23, as two classes see the same question. Sample text written to show reading levels.
      </figcaption>
    </figure>
  );
}
