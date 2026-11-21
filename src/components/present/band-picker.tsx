"use client";

import { BANDS, BAND_SHORT, type GradeBand } from "@/lib/content/levels";

/**
 * The students' reading level: four choices, set once for the class. Each says
 * whether today's devotional has its own version for that level.
 */
export function BandPicker({
  value, written, onChange, name, tone = "light", compact = false,
}: {
  value: GradeBand | null;
  written: GradeBand[];
  onChange: (band: GradeBand) => void;
  name: string;
  tone?: "light" | "plain";
  /** Two columns even on wide screens, for narrow side panels. */
  compact?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Reading level" className={`grid grid-cols-2 gap-2 ${compact ? "" : "sm:grid-cols-4"}`}>
      {BANDS.map((band) => {
        const own = written.includes(band);
        return (
          <label key={band} className="relative">
            <input type="radio" name={name} className="peer sr-only" checked={value === band} onChange={() => onChange(band)} />
            <span
              className={`grid min-h-16 content-center rounded-md border-2 px-2 py-1.5 text-center peer-focus-visible:ring-4 peer-focus-visible:ring-[#1c2a47]/50 ${
                value === band
                  ? "border-[#1c2a47] bg-[#1c2a47] text-white"
                  : `border-[#777] ${tone === "light" ? "bg-white" : "bg-transparent"} text-[#111] hover:border-[#1c2a47]`
              }`}
            >
              <span className="text-lg font-bold leading-tight">{band === "k2" ? "K–2" : `Grades ${BAND_SHORT[band]}`}</span>
              <span className={`text-xs font-medium ${value === band ? "text-white" : "text-[#333]"}`}>{own ? "Written for this age" : "Standard text"}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
