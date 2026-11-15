/**
 * Scripture references and display rules.
 *
 * A reference ("Galatians 6:9-10") is a pointer, not a quotation, and can
 * always be shown. The passage text can be shown only when the translation's
 * licence record says so; the database refuses to store it otherwise.
 */

const BOOKS: ReadonlyArray<readonly [name: string, chapters: number, aliases: readonly string[]]> = [
  ["Genesis", 50, ["gen", "ge", "gn"]],
  ["Exodus", 40, ["exod", "ex", "exo"]],
  ["Leviticus", 27, ["lev", "le", "lv"]],
  ["Numbers", 36, ["num", "nu", "nm"]],
  ["Deuteronomy", 34, ["deut", "dt", "de"]],
  ["Joshua", 24, ["josh", "jos"]],
  ["Judges", 21, ["judg", "jdg"]],
  ["Ruth", 4, ["ru"]],
  ["1 Samuel", 31, ["1 sam", "1 sm", "1sa"]],
  ["2 Samuel", 24, ["2 sam", "2 sm", "2sa"]],
  ["1 Kings", 22, ["1 kgs", "1 ki"]],
  ["2 Kings", 25, ["2 kgs", "2 ki"]],
  ["1 Chronicles", 29, ["1 chron", "1 chr", "1 ch"]],
  ["2 Chronicles", 36, ["2 chron", "2 chr", "2 ch"]],
  ["Ezra", 10, ["ezr"]],
  ["Nehemiah", 13, ["neh", "ne"]],
  ["Esther", 10, ["esth", "est"]],
  ["Job", 42, ["jb"]],
  ["Psalms", 150, ["psalm", "ps", "psa", "pss"]],
  ["Proverbs", 31, ["prov", "pr", "prv"]],
  ["Ecclesiastes", 12, ["eccl", "eccles", "ecc", "qoheleth"]],
  ["Song of Solomon", 8, ["song of songs", "song", "sos", "songs"]],
  ["Isaiah", 66, ["isa", "is"]],
  ["Jeremiah", 52, ["jer", "je"]],
  ["Lamentations", 5, ["lam", "la"]],
  ["Ezekiel", 48, ["ezek", "eze"]],
  ["Daniel", 12, ["dan", "da"]],
  ["Hosea", 14, ["hos", "ho"]],
  ["Joel", 3, ["jl"]],
  ["Amos", 9, ["am"]],
  ["Obadiah", 1, ["obad", "ob"]],
  ["Jonah", 4, ["jon"]],
  ["Micah", 7, ["mic"]],
  ["Nahum", 3, ["nah", "na"]],
  ["Habakkuk", 3, ["hab"]],
  ["Zephaniah", 3, ["zeph", "zep"]],
  ["Haggai", 2, ["hag"]],
  ["Zechariah", 14, ["zech", "zec"]],
  ["Malachi", 4, ["mal"]],
  ["Matthew", 28, ["matt", "mt"]],
  ["Mark", 16, ["mk", "mr"]],
  ["Luke", 24, ["lk", "lu"]],
  ["John", 21, ["jn", "joh"]],
  ["Acts", 28, ["ac"]],
  ["Romans", 16, ["rom", "ro", "rm"]],
  ["1 Corinthians", 16, ["1 cor", "1 co"]],
  ["2 Corinthians", 13, ["2 cor", "2 co"]],
  ["Galatians", 6, ["gal", "ga"]],
  ["Ephesians", 6, ["eph"]],
  ["Philippians", 4, ["phil", "php", "pp"]],
  ["Colossians", 4, ["col"]],
  ["1 Thessalonians", 5, ["1 thess", "1 thes", "1 th"]],
  ["2 Thessalonians", 3, ["2 thess", "2 thes", "2 th"]],
  ["1 Timothy", 6, ["1 tim", "1 ti"]],
  ["2 Timothy", 4, ["2 tim", "2 ti"]],
  ["Titus", 3, ["tit"]],
  ["Philemon", 1, ["philem", "phm", "phlm"]],
  ["Hebrews", 13, ["heb"]],
  ["James", 5, ["jas", "jm"]],
  ["1 Peter", 5, ["1 pet", "1 pe", "1 pt"]],
  ["2 Peter", 3, ["2 pet", "2 pe", "2 pt"]],
  ["1 John", 5, ["1 jn", "1 jo"]],
  ["2 John", 1, ["2 jn", "2 jo"]],
  ["3 John", 1, ["3 jn", "3 jo"]],
  ["Jude", 1, ["jud"]],
  ["Revelation", 22, ["rev", "re", "revelations"]],
];

const key = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(i{1,3}|first|second|third)\s+/, (m) => ({ i: "1 ", ii: "2 ", iii: "3 ", first: "1 ", second: "2 ", third: "3 " })[m.trim()] ?? m)
    .replace(/^([123])(?=[a-z])/, "$1 ");

const LOOKUP = new Map<string, { name: string; chapters: number }>();
for (const [name, chapters, aliases] of BOOKS) {
  for (const alias of [name.toLowerCase(), ...aliases]) LOOKUP.set(key(alias), { name, chapters });
}

export const BOOK_NAMES: readonly string[] = BOOKS.map(([name]) => name);

export type ParsedReference =
  | { ok: true; normalized: string; book: string; chapter: number }
  | { ok: false; error: string };

const RANGE = /^(?<book>.+?)\s+(?<rest>\d+(?:\s*[:.]\s*\d+)?(?:\s*[-–—]\s*\d+(?:\s*[:.]\s*\d+)?)?)$/;

/**
 * Checks and normalizes a single passage: "Gal 6:9-10" becomes "Galatians 6:9–10".
 * Accepts a chapter, a verse or verse range, or a range across chapters. It does
 * not check verse numbers against the chapter's length.
 */
export function parseReference(input: string): ParsedReference {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter a Scripture reference, such as Galatians 6:9." };
  if (/[;,]/.test(text)) return { ok: false, error: "Enter one passage per devotional, such as Romans 8:28–30." };

  const match = RANGE.exec(text);
  if (!match?.groups) return { ok: false, error: "Use the form Book chapter:verse, such as Galatians 6:9–10." };
  const book = LOOKUP.get(key(match.groups.book!));
  if (!book) return { ok: false, error: `“${match.groups.book}” is not a book of the Bible.` };

  const rest = match.groups.rest!.replace(/\s+/g, "").replace(/[–—]/g, "-").replace(/\./g, ":");
  const [startRaw, endRaw] = rest.split("-") as [string, string | undefined];
  const parse = (value: string) => {
    const [c, v] = value.split(":");
    return { chapter: Number(c), verse: v === undefined ? undefined : Number(v) };
  };
  let start = parse(startRaw);
  const end = endRaw === undefined ? undefined : parse(endRaw);

  // Single-chapter books are cited by verse: "Jude 5" means Jude 1:5.
  if (book.chapters === 1 && start.verse === undefined && start.chapter > 1) {
    start = { chapter: 1, verse: start.chapter };
    if (end && end.verse === undefined) {
      const bare = end.chapter;
      return finish(book, start, { chapter: 1, verse: bare });
    }
  }
  return finish(book, start, end);
}

type Point = { chapter: number; verse?: number | undefined };

function finish(book: { name: string; chapters: number }, start: Point, end: Point | undefined): ParsedReference {
  const bad = (error: string): ParsedReference => ({ ok: false, error });
  const inBook = (p: Point) => p.chapter >= 1 && p.chapter <= book.chapters;
  if (!inBook(start)) return bad(`${book.name} has ${book.chapters} ${book.chapters === 1 ? "chapter" : "chapters"}.`);
  if (start.verse !== undefined && start.verse < 1) return bad("Verse numbers start at 1.");

  const crossesChapters = Boolean(end && (start.verse === undefined || end.verse !== undefined));
  const name = book.name === "Psalms" && !crossesChapters ? "Psalm" : book.name;
  let normalized = `${name} ${start.chapter}${start.verse !== undefined ? `:${start.verse}` : ""}`;
  if (end) {
    if (start.verse !== undefined && end.verse === undefined) {
      // "6:9-10": the end is a verse in the same chapter
      if (end.chapter < start.verse) return bad("The passage must end after it begins.");
      normalized += `–${end.chapter}`;
    } else if (start.verse === undefined && end.verse === undefined) {
      if (!inBook(end)) return bad(`${book.name} has ${book.chapters} chapters.`);
      if (end.chapter <= start.chapter) return bad("The passage must end after it begins.");
      normalized += `–${end.chapter}`;
    } else if (start.verse !== undefined && end.verse !== undefined) {
      if (!inBook(end)) return bad(`${book.name} has ${book.chapters} chapters.`);
      if (end.chapter < start.chapter || (end.chapter === start.chapter && end.verse <= start.verse)) {
        return bad("The passage must end after it begins.");
      }
      normalized += end.chapter === start.chapter ? `–${end.verse}` : `–${end.chapter}:${end.verse}`;
    } else {
      return bad("Use the form Book chapter:verse, such as Galatians 6:9–10.");
    }
  }
  return { ok: true, normalized, book: book.name, chapter: start.chapter };
}

// ---------------------------------------------------------------------------
// Display rules
// ---------------------------------------------------------------------------

export type TranslationLicense = {
  code: string;
  name: string;
  license_type: "public_domain" | "licensed" | "reference_only";
  text_allowed: boolean;
  attribution: string | null;
};

export type ScriptureDisplay =
  | { mode: "text"; text: string; attribution: string }
  | { mode: "reference"; reason: "no_text" | "not_licensed" };

/**
 * What a reader may be shown. Text appears only when it exists AND the
 * translation's licence currently allows it. A licensed translation without
 * an attribution is never shown (the database makes that state impossible,
 * this keeps the page safe if it ever happens).
 */
export function scriptureDisplay(text: string | null, translation: TranslationLicense | null): ScriptureDisplay {
  if (!text || text.trim() === "") return { mode: "reference", reason: "no_text" };
  if (!translation || !translation.text_allowed) return { mode: "reference", reason: "not_licensed" };
  const attribution = translation.attribution?.trim();
  if (translation.license_type === "licensed" && !attribution) return { mode: "reference", reason: "not_licensed" };
  return { mode: "text", text: text.trim(), attribution: attribution || `${translation.name} (${translation.code.toUpperCase()}), public domain.` };
}

/** Where to read a passage that cannot be displayed here. Opens a public Bible site in a new tab. */
export function passageLookupUrl(reference: string, translationCode: string | null): string {
  const url = new URL("https://www.biblegateway.com/passage/");
  url.searchParams.set("search", reference);
  if (translationCode) url.searchParams.set("version", translationCode.toUpperCase());
  return url.toString();
}

/**
 * Decides how a search box entry should be searched. Something that reads as a
 * passage with a chapter ("gal 6", "John 3:16") becomes an exact book-and-chapter
 * lookup, so "John 3" does not return "1 John 3". Anything else is a keyword search
 * (a bare book name is treated as a keyword so words like "mark" or "acts" still work).
 */
export type SearchTarget = { kind: "reference"; book: string; chapter: number } | { kind: "text"; text: string };

export function searchTarget(query: string): SearchTarget {
  const text = query.trim();
  const parsed = parseReference(text);
  if (parsed.ok) return { kind: "reference", book: parsed.book, chapter: parsed.chapter };
  return { kind: "text", text };
}
