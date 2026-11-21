/**
 * The product's idea in one picture: the same day, the same psalm, written for
 * two ages, as each class would see it on the projector. Sample text, labelled.
 */
const SAMPLES = [
  {
    band: "Kindergarten to grade 2",
    label: "Let’s talk",
    text: "When did someone wait for you to finish something?",
  },
  {
    band: "Grades 9 to 12",
    label: "Think about it",
    text: "Where does our culture reward speed over patience, and what gets lost when it does?",
  },
] as const;

export function SameDayEveryAge() {
  return (
    <figure>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {SAMPLES.map((s) => (
          <div key={s.band}>
            <p className="mb-2 text-sm font-semibold text-muted">{s.band}</p>
            {/* A projected slide in miniature: the same type and colours as classroom mode. */}
            <div className="grid aspect-video place-items-center rounded-card border border-line-strong/40 bg-surface p-[7%] text-center shadow-[0_18px_40px_-24px_rgb(20_32_43/0.45)]">
              <div>
                <p className="text-sm font-semibold text-brand md:text-lg">{s.label}</p>
                <p className="mt-2 font-serif text-xl font-semibold leading-snug text-balance sm:text-2xl xl:text-2xl">{s.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <figcaption className="mt-4 text-sm text-muted">
        Monday, Psalm 23, as two classes see it. Sample text written to show reading levels; the first 180 days are being
        written and reviewed now.
      </figcaption>
    </figure>
  );
}
