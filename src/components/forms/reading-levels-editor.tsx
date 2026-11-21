"use client";

import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { draftLevelForEditorAction } from "@/app/actions/ai";
import { AiCounter, OUT_OF_REQUESTS } from "@/components/present/ai-counter";
import type { AiQuota } from "@/lib/ai/devotional-ai";
import { RichTextEditor } from "@/components/content/rich-text-editor";
import { BANDS, BAND_LONG, BAND_SHORT, LEVEL_FIELDS, type GradeBand, type LevelField, type Levels, type LevelVersion } from "@/lib/content/levels";
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
  initial, echoed, errors, ai,
}: {
  /** AI drafting for editors: whether the server has an AI key, and requests left today. */
  ai?: { configured: boolean; quota: AiQuota | null };
  initial: Levels;
  /** Values sent back after a failed save, keyed by form field name. */
  echoed: Record<string, unknown> | undefined;
  errors: Record<string, string | undefined>;
}) {
  const [active, setActive] = useState<GradeBand>("k2");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  const root = useRef<HTMLDivElement>(null);
  // AI drafts replace a band's four boxes; the nonce remounts those editors with the new text.
  const [drafts, setDrafts] = useState<Partial<Record<GradeBand, Required<LevelVersion>>>>({});
  const [nonce, setNonce] = useState<Partial<Record<GradeBand, number>>>({});
  const [status, setStatus] = useState<Partial<Record<GradeBand, { tone: "info" | "error"; message: string }>>>({});
  const [quota, setQuota] = useState<AiQuota | null>(ai?.quota ?? null);
  const [pending, start] = useTransition();
  const outOfRequests = quota !== null && quota.remaining <= 0;

  /** Reads a field of the surrounding devotional form as it is now (saved or not). */
  const formValue = (name: string): string => {
    const el = root.current?.closest("form")?.elements.namedItem(name);
    // A single field, or (for repeated names) a RadioNodeList; both expose .value.
    return el && "value" in el ? String(el.value ?? "") : "";
  };
  const formDoc = (name: string): RichDoc => parseRichDoc(formValue(name)) ?? EMPTY_DOC;

  const draftWithAi = (band: GradeBand) => {
    const hasText = LEVEL_FIELDS.some((f) => (parseRichDoc(formValue(levelFieldName(band, f)))?.content.length ?? 0) > 0);
    if (hasText && !window.confirm(`Replace the ${BAND_SHORT[band]} text with an AI draft?`)) return;
    setStatus((s) => ({ ...s, [band]: { tone: "info", message: `Writing a draft for ${BAND_LONG[band].toLowerCase()}. This takes about half a minute.` } }));
    start(async () => {
      const result = await draftLevelForEditorAction({
        band,
        title: formValue("title"),
        topic: formValue("dailyTopic"),
        reference: formValue("scriptureReference"),
        scriptureText: formValue("scriptureText"),
        standard: {
          reflection: formDoc("reflection"),
          discussion_question: formDoc("discussionQuestion"),
          practical_application: formDoc("practicalApplication"),
          prayer: formDoc("prayer"),
        },
      });
      if (!result.ok) {
        setStatus((s) => ({ ...s, [band]: { tone: "error", message: result.error } }));
        if (/used today/.test(result.error) && quota) setQuota({ ...quota, remaining: 0 });
        return;
      }
      if (quota) setQuota({ ...quota, remaining: result.remaining });
      setDrafts((d) => ({ ...d, [band]: result.version }));
      setNonce((n) => ({ ...n, [band]: (n[band] ?? 0) + 1 }));
      setStatus((s) => ({ ...s, [band]: { tone: "info", message: "AI draft added below. Read and edit it, then save the devotional. It goes through review like any other change." } }));
    });
  };

  const value = (band: GradeBand, field: LevelField): RichDoc => {
    const raw = echoed?.[levelFieldName(band, field)];
    return drafts[band]?.[field] ?? (typeof raw === "string" ? parseRichDoc(raw) : null) ?? initial[band]?.[field] ?? EMPTY_DOC;
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
    <div ref={root}>
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
          {ai ? (
            <div className="grid gap-2 rounded-control border border-line bg-parchment p-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => draftWithAi(band)}
                  disabled={!ai.configured || pending || outOfRequests}
                  className="inline-flex min-h-11 items-center rounded-control border border-brand bg-brand px-4 font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
                >
                  {pending ? "Writing…" : `Draft ${BAND_SHORT[band]} with AI`}
                </button>
                {ai.configured && quota ? <AiCounter quota={quota} /> : null}
              </div>
              <p className="text-sm text-muted">
                {!ai.configured
                  ? "The AI tools are not set up on this server yet (ANTHROPIC_API_KEY)."
                  : outOfRequests && quota
                    ? OUT_OF_REQUESTS(quota.limit)
                    : "Adapts the standard text above for this age, keeping the same Scripture. You review and edit it before saving."}
              </p>
              {status[band] ? (
                <p role={status[band]!.tone === "error" ? "alert" : "status"} className={`text-sm font-medium ${status[band]!.tone === "error" ? "text-danger" : "text-brand"}`}>
                  {status[band]!.message}
                </p>
              ) : null}
            </div>
          ) : null}
          {LEVEL_FIELDS.map((field) => {
            const name = levelFieldName(band, field);
            return (
              <RichTextEditor
                key={`${name}-${nonce[band] ?? 0}`}
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
