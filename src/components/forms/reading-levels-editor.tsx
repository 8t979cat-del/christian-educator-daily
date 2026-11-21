"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { RichTextEditor } from "@/components/content/rich-text-editor";
import { BANDS, BAND_LONG, BAND_SHORT, LEVEL_FIELDS, type GradeBand, type LevelField, type Levels } from "@/lib/content/levels";
import { EMPTY_DOC, parseRichDoc, type RichDoc } from "@/lib/content/richtext";
import { levelFieldName } from "@/lib/content/schemas";

const FIELD_LABELS: Record<LevelField, { label: string; minHeight: number }> = {
  reflection: { label: "Reflection", minHeight: 10 },
  discussion_question: { label: "Discussion question", minHeight: 5 },
  practical_application: { label: "Practical application", minHeight: 5 },
  prayer: { label: "Prayer", minHeight: 6 },
};

/**
 * One tab per age band. Every band's editors stay in the form (inactive ones are
 * hidden), so switching tabs never loses text and saving submits all of them.
 */
export function ReadingLevelsEditor({
  initial, echoed, errors,
}: {
  initial: Levels;
  /** Values sent back after a failed save, keyed by form field name. */
  echoed: Record<string, unknown> | undefined;
  errors: Record<string, string | undefined>;
}) {
  const [active, setActive] = useState<GradeBand>("k2");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();

  const value = (band: GradeBand, field: LevelField): RichDoc => {
    const raw = echoed?.[levelFieldName(band, field)];
    return (typeof raw === "string" ? parseRichDoc(raw) : null) ?? initial[band]?.[field] ?? EMPTY_DOC;
  };
  const written = (band: GradeBand) => LEVEL_FIELDS.filter((f) => initial[band]?.[f] !== undefined).length;
  const hasError = (band: GradeBand) => LEVEL_FIELDS.some((f) => errors[levelFieldName(band, f)]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? BANDS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + BANDS.length) % BANDS.length;
    setActive(BANDS[j]!);
    tabs.current[j]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Reading level" className="flex flex-wrap gap-2 border-b border-line">
        {BANDS.map((band, i) => {
          const selected = band === active;
          const count = written(band);
          return (
            <button
              key={band}
              ref={(el) => { tabs.current[i] = el; }}
              id={`${base}-tab-${band}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${band}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(band)}
              onKeyDown={(e) => onKey(e, i)}
              className={`-mb-px min-h-11 rounded-t-control border border-b-0 px-4 text-left font-semibold ${selected ? "border-line bg-surface text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              <span className="block">{BAND_SHORT[band]}</span>
              <span className={`block text-xs font-medium ${hasError(band) ? "text-danger" : ""}`}>
                {hasError(band) ? "Needs a fix" : count === 0 ? "Standard text" : count === LEVEL_FIELDS.length ? "Own version" : `${count} of 4 written`}
              </span>
            </button>
          );
        })}
      </div>
      {BANDS.map((band) => (
        <div
          key={band}
          id={`${base}-panel-${band}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${band}`}
          hidden={band !== active}
          className="grid gap-8 pt-6"
        >
          <p className="text-sm text-muted">
            Write {BAND_LONG[band].toLowerCase()} their own version of any part. Anything left empty uses the standard text above.
          </p>
          {LEVEL_FIELDS.map((field) => {
            const name = levelFieldName(band, field);
            return (
              <RichTextEditor
                key={name}
                name={name}
                label={`${FIELD_LABELS[field].label} (${BAND_SHORT[band]})`}
                initial={value(band, field)}
                error={errors[name]}
                minHeight={FIELD_LABELS[field].minHeight}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
