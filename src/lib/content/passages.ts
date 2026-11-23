import { parseReference } from "./scripture";

/**
 * Passage overlap, for keeping AI-written devotionals varied: Philippians 4:4–7 and
 * Philippians 4:6–7 share verses, so they count as the same passage. Works on any
 * reference parseReference accepts.
 */

export type Span = { book: string; from: number; to: number };

// A position as chapter * 1000 + verse. A whole chapter runs from verse 0 to 999.
const at = (chapter: number, verse: number) => chapter * 1000 + verse;

/** The verses a reference covers, or null if it cannot be read. */
export function passageSpan(reference: string): Span | null {
  const parsed = parseReference(reference);
  if (!parsed.ok) return null;
  // The normalized form ends with "C", "C:V", "C:V–V", "C–C" or "C:V–C:V".
  const tail = /\s(\d+)(?::(\d+))?(?:–(\d+)(?::(\d+))?)?$/.exec(parsed.normalized);
  if (!tail) return null;
  const [c1, v1, x, v2] = [Number(tail[1]), tail[2] === undefined ? undefined : Number(tail[2]), tail[3] === undefined ? undefined : Number(tail[3]), tail[4] === undefined ? undefined : Number(tail[4])];
  const from = at(c1, v1 ?? 0);
  let to: number;
  if (x === undefined) to = v1 === undefined ? at(c1, 999) : at(c1, v1); // "C" or "C:V"
  else if (v1 !== undefined && v2 === undefined) to = at(c1, x); // "C:V–W": a verse range in one chapter
  else to = at(x, v2 ?? 999); // "C–D" or "C:V–D:W"
  return { book: parsed.book, from, to: Math.max(from, to) };
}

export const spansOverlap = (a: Span, b: Span) => a.book === b.book && a.from <= b.to && b.from <= a.to;

export type UsedPassage = { reference: string; title: string; date?: string | null };

/** The first used passage that shares a verse with `reference`, if any. */
export function findOverlap<T extends UsedPassage>(reference: string, used: T[]): T | null {
  const span = passageSpan(reference);
  if (!span) return null;
  for (const u of used) {
    const other = passageSpan(u.reference);
    if (other && spansOverlap(span, other)) return u;
  }
  return null;
}

/** The used list as the AI sees it: "Reference (“Title”)", newest first, at most `max` lines. */
export const describeUsed = (used: UsedPassage[], max = 120): string[] =>
  used.filter((u) => u.reference).slice(0, max).map((u) => (u.title ? `${u.reference} (“${u.title}”)` : u.reference));
