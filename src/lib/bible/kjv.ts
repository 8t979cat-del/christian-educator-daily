import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReference } from "@/lib/content/scripture";
import { BIBLES, type BibleCode } from "./bibles";

/**
 * Public-domain Bibles bundled with the site in data/<code>.json: the King James
 * Version (1769), the World English Bible and the American Standard Version (1901).
 * Used when AI writes a devotional and when an editor fills in a passage: the AI
 * only chooses the reference; the words of Scripture always come from here.
 */
type BibleData = { books: Array<{ name: string; chapters: string[][] }> };

export { BIBLES, BIBLE_CODES, isBibleCode, type BibleCode } from "./bibles";

const cache = new Map<BibleCode, Map<string, string[][]>>();

function books(code: BibleCode): Map<string, string[][]> {
  let found = cache.get(code);
  if (!found) {
    const data = JSON.parse(readFileSync(join(process.cwd(), "data", `${code}.json`), "utf8")) as BibleData;
    found = new Map(data.books.map((b) => [b.name, b.chapters]));
    cache.set(code, found);
  }
  return found;
}

export const KJV = BIBLES.kjv;

/** Longest passage a generated devotional may use, so it stays on a few slides. */
export const MAX_VERSES = 20;

export type Passage = { reference: string; text: string; verses: number };

/** The passage in the King James Version (see biblePassage). */
export const kjvPassage = (reference: string) => biblePassage("kjv", reference);

/**
 * The text of a passage, one verse per line, each starting with its number
 * (the form classroom mode shows). Verses a translation leaves out (some modern
 * texts omit a few) are skipped. Null when the reference is not valid, not in the
 * Bible, or longer than maxVerses.
 */
export function biblePassage(code: BibleCode, reference: string, maxVerses: number = MAX_VERSES): Passage | null {
  const parsed = parseReference(reference);
  if (!parsed.ok) return null;
  const chapters = books(code).get(parsed.book);
  if (!chapters) return null;
  // The parser's normalized form: "Book C", "Book C:V", "Book C:V–V", "Book C–C" or "Book C:V–C:V".
  const m = /\s(\d+)(?::(\d+))?(?:–(\d+)(?::(\d+))?)?$/.exec(parsed.normalized);
  if (!m) return null;
  const c1 = Number(m[1]);
  const v1 = m[2] ? Number(m[2]) : 1;
  let c2 = c1;
  let v2: number | null = m[2] ? v1 : null;
  if (m[3]) {
    if (m[2] && !m[4]) v2 = Number(m[3]); // 6:9–10
    else { c2 = Number(m[3]); v2 = m[4] ? Number(m[4]) : null; } // 23–24, or 1:2–3:4
  }
  const lines: string[] = [];
  for (let c = c1; c <= c2; c++) {
    const verses = chapters[c - 1];
    if (!verses) return null;
    const from = c === c1 ? v1 : 1;
    const to = c === c2 && v2 !== null ? v2 : verses.length;
    if (to > verses.length || from > to) return null;
    for (let v = from; v <= to; v++) if (verses[v - 1]) lines.push(`${v} ${verses[v - 1]}`);
  }
  if (lines.length === 0 || lines.length > maxVerses) return null;
  return { reference: parsed.normalized, text: lines.join("\n"), verses: lines.length };
}
