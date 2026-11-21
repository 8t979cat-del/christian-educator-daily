import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReference } from "@/lib/content/scripture";

/**
 * The King James Version (1769 text, public domain in the United States),
 * bundled with the site in data/kjv.json. Used when AI writes a devotional:
 * the AI only chooses the reference; the words of Scripture always come from here.
 */
type Kjv = { books: Array<{ name: string; chapters: string[][] }> };
let cache: Map<string, string[][]> | null = null;

function books(): Map<string, string[][]> {
  if (!cache) {
    const data = JSON.parse(readFileSync(join(process.cwd(), "data", "kjv.json"), "utf8")) as Kjv;
    cache = new Map(data.books.map((b) => [b.name, b.chapters]));
  }
  return cache;
}

export const KJV = {
  code: "kjv",
  label: "King James Version (KJV)",
  notice: "King James Version (KJV), public domain in the United States.",
} as const;

/** Longest passage a generated devotional may use, so it stays on a few slides. */
export const MAX_VERSES = 20;

export type Passage = { reference: string; text: string; verses: number };

/**
 * The text of a passage, one verse per line, each starting with its number
 * (the form classroom mode shows). Null when the reference is not valid, not in
 * the KJV, or longer than MAX_VERSES.
 */
export function kjvPassage(reference: string): Passage | null {
  const parsed = parseReference(reference);
  if (!parsed.ok) return null;
  const chapters = books().get(parsed.book);
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
    for (let v = from; v <= to; v++) lines.push(`${v} ${verses[v - 1]}`);
  }
  if (lines.length === 0 || lines.length > MAX_VERSES) return null;
  return { reference: parsed.normalized, text: lines.join("\n"), verses: lines.length };
}
