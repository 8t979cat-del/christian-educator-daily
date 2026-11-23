import { EMPTY_DOC, isRichDocEmpty, sanitizeRichDoc, type RichDoc } from "./richtext";

/**
 * Reading levels. Every devotional has one Scripture passage and theme, and a
 * standard version of its text. An editor may also write a version for an age
 * band; teachers choose their band when presenting. A band without its own
 * version, or a field left empty in it, uses the standard text.
 */
export const BANDS = ["k2", "g35", "g68", "g912"] as const;
export type GradeBand = (typeof BANDS)[number];

/** Short labels for tight spaces (the band picker); long labels live in GRADE_BANDS. */
export const BAND_SHORT: Record<GradeBand, string> = { k2: "K–2", g35: "3–5", g68: "6–8", g912: "9–12" };
export const BAND_LONG: Record<GradeBand, string> = { k2: "Kindergarten to grade 2", g35: "Grades 3 to 5", g68: "Grades 6 to 8", g912: "Grades 9 to 12" };

/**
 * The age band the standard text is written for. "Draft a devotional with AI" writes at this
 * level, and this band shows the standard text: it is never rewritten by AI, only by an editor.
 */
export const STANDARD_BAND: GradeBand = "g68";

export const isBand = (v: unknown): v is GradeBand => typeof v === "string" && (BANDS as readonly string[]).includes(v);

export const LEVEL_FIELDS = ["reflection", "discussion_question", "practical_application", "prayer"] as const;
export type LevelField = (typeof LEVEL_FIELDS)[number];
export type LevelVersion = Partial<Record<LevelField, RichDoc>>;
export type Levels = Partial<Record<GradeBand, LevelVersion>>;

/** Reads stored levels defensively: unknown bands and fields, invalid documents and empty text are dropped. */
export function toLevels(raw: unknown): Levels {
  const out: Levels = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const band of BANDS) {
    const version = (raw as Record<string, unknown>)[band];
    if (typeof version !== "object" || version === null) continue;
    const clean: LevelVersion = {};
    for (const field of LEVEL_FIELDS) {
      const doc = sanitizeRichDoc((version as Record<string, unknown>)[field]);
      if (doc && !isRichDocEmpty(doc)) clean[field] = doc;
    }
    if (Object.keys(clean).length > 0) out[band] = clean;
  }
  return out;
}

export type StandardText = Record<LevelField, RichDoc>;

/** The text a class in this band sees: its own version where written, the standard text elsewhere. */
export function textForBand(standard: StandardText, levels: Levels, band: GradeBand): StandardText & { written: LevelField[] } {
  const version = levels[band] ?? {};
  const written = LEVEL_FIELDS.filter((f) => version[f] !== undefined);
  return {
    reflection: version.reflection ?? standard.reflection ?? EMPTY_DOC,
    discussion_question: version.discussion_question ?? standard.discussion_question ?? EMPTY_DOC,
    practical_application: version.practical_application ?? standard.practical_application ?? EMPTY_DOC,
    prayer: version.prayer ?? standard.prayer ?? EMPTY_DOC,
    written,
  };
}

/** Bands that have their own written version (any field). */
export const bandsWithVersion = (levels: Levels): GradeBand[] => BANDS.filter((b) => levels[b] !== undefined);
