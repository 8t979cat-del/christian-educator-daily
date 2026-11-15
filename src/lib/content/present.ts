/**
 * Classroom presentation: pure logic, no React and no browser APIs, so it can be
 * unit tested. It turns a devotional into a list of slides, splits long Scripture
 * and long text across several slides so everything stays readable from the back of
 * a room, and holds the display settings and colour themes.
 */
import { richTextToPlain, type Block, type Inline, type RichDoc } from "./richtext";

// ---------------------------------------------------------------------------
// Sections and settings
// ---------------------------------------------------------------------------
export const SECTION_IDS = ["theme", "title", "scripture", "reflection", "discussion", "practice", "prayer"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SECTION_LABELS: Record<SectionId, string> = {
  theme: "Weekly theme",
  title: "Devotional title",
  scripture: "Scripture passage",
  reflection: "Reflection",
  discussion: "Discussion question",
  practice: "Put it into practice",
  prayer: "Closing prayer",
};

/** Contrast of every pair is checked in tests: all are at least 7:1 (WCAG AAA). */
export const PRESENT_THEMES = {
  white: { label: "White", bg: "#ffffff", fg: "#111111", accent: "#0b4f49", muted: "#333333" },
  cream: { label: "Cream", bg: "#fbf6e9", fg: "#161616", accent: "#0b4f49", muted: "#363636" },
  dark: { label: "Dark", bg: "#0f1720", fg: "#ffffff", accent: "#8fd0c6", muted: "#d6dde4" },
  contrast: { label: "High contrast", bg: "#000000", fg: "#ffffff", accent: "#ffe14d", muted: "#e8e8e8" },
} as const;
export type ThemeId = keyof typeof PRESENT_THEMES;
export const THEME_IDS = Object.keys(PRESENT_THEMES) as ThemeId[];

/** Text size steps. 1 is the default. */
export const SIZE_SCALES = [0.8, 1, 1.25, 1.55, 1.9] as const;
export const DEFAULT_SIZE = 1;

export type PresentSettings = {
  theme: ThemeId;
  size: number;
  /** Younger students: bigger type, friendlier headings, one small idea per slide. */
  simple: boolean;
  sections: Record<SectionId, boolean>;
  showReference: boolean;
  showTranslation: boolean;
};

export const DEFAULT_SETTINGS: PresentSettings = {
  theme: "white",
  size: DEFAULT_SIZE,
  simple: false,
  sections: { theme: true, title: true, scripture: true, reflection: true, discussion: true, practice: true, prayer: true },
  showReference: true,
  showTranslation: true,
};

/** Reads saved settings defensively: anything unexpected falls back to the default. */
export function parseSettings(raw: unknown): PresentSettings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== "object" || raw === null) return { ...d, sections: { ...d.sections } };
  const r = raw as Record<string, unknown>;
  const sectionsRaw = typeof r.sections === "object" && r.sections !== null ? (r.sections as Record<string, unknown>) : {};
  const sections = { ...d.sections };
  for (const id of SECTION_IDS) if (typeof sectionsRaw[id] === "boolean") sections[id] = sectionsRaw[id] as boolean;
  const size = typeof r.size === "number" && Number.isInteger(r.size) && r.size >= 0 && r.size < SIZE_SCALES.length ? r.size : d.size;
  return {
    theme: typeof r.theme === "string" && (THEME_IDS as string[]).includes(r.theme) ? (r.theme as ThemeId) : d.theme,
    size,
    simple: typeof r.simple === "boolean" ? r.simple : d.simple,
    sections,
    showReference: typeof r.showReference === "boolean" ? r.showReference : d.showReference,
    showTranslation: typeof r.showTranslation === "boolean" ? r.showTranslation : d.showTranslation,
  };
}

// ---------------------------------------------------------------------------
// Colour contrast (WCAG 2)
// ---------------------------------------------------------------------------
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// Splitting long text so it stays large
// ---------------------------------------------------------------------------
const BREAK_TIERS = [/[.!?]["”’']?\s/g, /[;:]["”’']?\s/g, /,\s/g];

/** End offsets (exclusive) of chunks no longer than `max`, cut at sentence, then clause, then word boundaries. */
export function cutPoints(text: string, max: number): number[] {
  const cuts: number[] = [];
  let start = 0;
  while (text.length - start > max) {
    const win = text.slice(start, start + max + 1);
    let cut = -1;
    for (const re of BREAK_TIERS) {
      re.lastIndex = 0;
      let last = -1;
      let m: RegExpExecArray | null;
      while ((m = re.exec(win))) last = m.index + m[0].length;
      if (last >= max * 0.5) {
        cut = last;
        break;
      }
    }
    if (cut < 0) {
      const space = win.lastIndexOf(" ");
      cut = space > max * 0.3 ? space + 1 : max;
    }
    cuts.push(start + cut);
    start += cut;
  }
  cuts.push(text.length);
  return cuts;
}

type Unit = { text: string; sepBefore: string };

function packUnits(units: Unit[], max: number): string[] {
  const pages: string[] = [];
  let cur = "";
  for (const unit of units) {
    const candidate = cur ? cur + unit.sepBefore + unit.text : unit.text;
    if (cur && candidate.length > max) {
      pages.push(cur);
      cur = unit.text;
    } else {
      cur = candidate;
    }
  }
  if (cur) pages.push(cur);
  return pages;
}

/**
 * Splits a Scripture passage into pages of at most `max` characters. Prefers to
 * break between verses (lines), then sentences, then clauses. Never drops or
 * reorders text, and evens out page lengths so the last page is not a stub.
 */
export function splitPassage(text: string, max: number): string[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (clean === "") return [];
  const limit = Math.max(40, Math.floor(max));
  if (clean.length <= limit) return [clean];

  const units: Unit[] = [];
  for (const line of clean.split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.length <= limit) {
      units.push({ text: trimmed, sepBefore: "\n" });
      continue;
    }
    let from = 0;
    cutPoints(trimmed, limit).forEach((end, i) => {
      const piece = trimmed.slice(from, end).trim();
      from = end;
      if (piece) units.push({ text: piece, sepBefore: i === 0 ? "\n" : " " });
    });
  }

  const pages = packUnits(units, limit);
  if (pages.length > 1) {
    // Even out: same page count with a smaller budget, if it still fits.
    const total = units.reduce((n, u) => n + u.text.length + 1, 0);
    const balanced = packUnits(units, Math.min(limit, Math.ceil((total / pages.length) * 1.15)));
    if (balanced.length === pages.length) return balanced;
  }
  return pages;
}

// ----- rich text -----

const inlineLength = (nodes: Inline[] | undefined): number =>
  (nodes ?? []).reduce((n, node) => n + (node.type === "text" ? node.text.length : 1), 0);

function inlinePlain(nodes: Inline[] | undefined): string {
  return (nodes ?? []).map((node) => (node.type === "text" ? node.text : "\n")).join("");
}

function sliceInline(nodes: Inline[], from: number, to: number): Inline[] {
  const out: Inline[] = [];
  let offset = 0;
  for (const node of nodes) {
    const len = node.type === "text" ? node.text.length : 1;
    const a = Math.max(from, offset);
    const b = Math.min(to, offset + len);
    if (a < b) {
      if (node.type === "text") out.push({ ...node, text: node.text.slice(a - offset, b - offset) });
      else out.push(node);
    }
    offset += len;
  }
  // Trim spaces at the cut edges.
  const first = out[0];
  if (first?.type === "text") out[0] = { ...first, text: first.text.replace(/^\s+/, "") };
  const last = out[out.length - 1];
  if (last?.type === "text") out[out.length - 1] = { ...last, text: last.text.replace(/\s+$/, "") };
  return out.filter((n) => n.type !== "text" || n.text !== "");
}

const blockSize = (block: Block): number => richTextToPlain({ type: "doc", content: [block] }).length;

/** Breaks one block that is longer than `max` into smaller blocks of the same kind. */
function splitBlock(block: Block, max: number): Block[] {
  if (blockSize(block) <= max) return [block];
  switch (block.type) {
    case "paragraph": {
      const content = block.content ?? [];
      const cuts = cutPoints(inlinePlain(content), max);
      let from = 0;
      const parts: Block[] = [];
      for (const end of cuts) {
        const piece = sliceInline(content, from, end);
        from = end;
        if (piece.length) parts.push({ type: "paragraph", content: piece });
      }
      return parts;
    }
    case "bulletList":
    case "orderedList":
      return block.content.map((item) => ({ ...block, content: [item] }) as Block);
    case "blockquote":
      return block.content.flatMap((inner) => splitBlock(inner, max).map((part) => ({ type: "blockquote", content: [part] }) as Block));
    case "heading":
      return [block];
  }
}

/** Splits a rich-text document into pages of roughly `max` characters, never separating a heading from what follows it. */
export function paginateDoc(doc: RichDoc, max: number): RichDoc[] {
  const limit = Math.max(60, Math.floor(max));
  const blocks = doc.content.flatMap((b) => splitBlock(b, limit)).filter((b) => b.type === "heading" || blockSize(b) > 0);
  if (blocks.length === 0) return [];

  const pages: Block[][] = [];
  let cur: Block[] = [];
  let size = 0;
  for (const block of blocks) {
    const s = blockSize(block);
    if (cur.length > 0 && size + s > limit) {
      pages.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(block);
    size += s;
  }
  if (cur.length) pages.push(cur);

  // A heading must not be the last thing on a page.
  for (let i = 0; i < pages.length - 1; i++) {
    const page = pages[i]!;
    const tail = page[page.length - 1];
    if (page.length > 1 && tail?.type === "heading") {
      page.pop();
      pages[i + 1]!.unshift(tail);
    }
  }
  return pages.map((content) => ({ type: "doc", content }));
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------
export type PresentContent = {
  dateLabel: string;
  title: string;
  topic: string;
  theme: { title: string; summary: string; dayLabel: string } | null;
  scripture: {
    reference: string;
    translationLabel: string | null;
    /** Present only when the translation's licence allows showing it. */
    text: string | null;
    /** Copyright or public-domain notice that goes with the text. */
    notice: string | null;
  };
  reflection: RichDoc;
  discussion: RichDoc;
  practice: RichDoc;
  prayer: RichDoc;
};

export type SlideBody =
  | { kind: "theme"; eyebrow: string; heading: string; text: string; dayLabel: string }
  | { kind: "title"; eyebrow: string; heading: string; text: string }
  | { kind: "scripture"; reference: string | null; translation: string | null; text: string; notice: string | null }
  | { kind: "reference"; reference: string; translation: string | null }
  | { kind: "rich"; heading: string; doc: RichDoc; emphasis: boolean };

export type Slide = {
  key: string;
  section: SectionId;
  /** Zero-based page within the section, when a long section spans several slides. */
  page: number;
  pageCount: number;
  /** Short name for screen readers and the progress dots. */
  label: string;
  body: SlideBody;
};

export const WIDTH_BUCKETS = [
  { below: 600, factor: 0.5 },
  { below: 1000, factor: 0.8 },
  { below: 1500, factor: 1 },
  { below: Number.POSITIVE_INFINITY, factor: 1.25 },
] as const;

/**
 * How many characters of one slide to aim for. Smaller screens, bigger type and
 * the young-students mode all allow fewer characters, so text keeps a readable
 * size instead of shrinking to fit.
 */
export function charBudget(kind: "scripture" | "rich", opts: { widthPx: number; size: number; simple: boolean }): number {
  const base = kind === "scripture" ? 700 : 420;
  const bucket = WIDTH_BUCKETS.find((b) => opts.widthPx < b.below)!.factor;
  const scale = SIZE_SCALES[opts.size] ?? 1;
  const simple = opts.simple ? 0.45 : 1;
  return Math.max(60, Math.round((base * bucket * simple) / (scale * scale)));
}

const HEADINGS = {
  normal: { reflection: "Reflection", discussion: "Think about it", practice: "Put it into practice", prayer: "Closing prayer", scripture: "Scripture", theme: "This week’s theme" },
  simple: { reflection: "Let’s think about it", discussion: "Let’s talk", practice: "Let’s try it", prayer: "Let’s pray", scripture: "Let’s read God’s Word", theme: "This week" },
} as const;

export function buildSlides(content: PresentContent, settings: PresentSettings, widthPx: number): Slide[] {
  const H = settings.simple ? HEADINGS.simple : HEADINGS.normal;
  const slides: Slide[] = [];
  const on = (id: SectionId) => settings.sections[id];

  const add = (section: SectionId, label: string, bodies: SlideBody[]) => {
    bodies.forEach((body, page) =>
      slides.push({
        key: `${section}-${page}`,
        section,
        page,
        pageCount: bodies.length,
        label: bodies.length > 1 ? `${label} (${page + 1} of ${bodies.length})` : label,
        body,
      }),
    );
  };

  if (on("theme") && content.theme) {
    add("theme", SECTION_LABELS.theme, [{ kind: "theme", eyebrow: H.theme, heading: content.theme.title, text: content.theme.summary, dayLabel: content.theme.dayLabel }]);
  }
  if (on("title") && content.title.trim()) {
    add("title", SECTION_LABELS.title, [{ kind: "title", eyebrow: content.dateLabel, heading: content.title, text: content.topic }]);
  }
  if (on("scripture")) {
    const s = content.scripture;
    const translation = settings.showTranslation ? s.translationLabel : null;
    if (s.text) {
      const pages = splitPassage(s.text, charBudget("scripture", { widthPx, size: settings.size, simple: settings.simple }));
      add("scripture", SECTION_LABELS.scripture, pages.map((text) => ({
        kind: "scripture" as const,
        reference: settings.showReference ? s.reference || null : null,
        translation,
        text,
        notice: s.notice,
      })));
    } else if (s.reference) {
      // Text we may not display: the reference is all the class has to go on, so it is always shown.
      add("scripture", SECTION_LABELS.scripture, [{ kind: "reference", reference: s.reference, translation }]);
    }
  }

  const rich: Array<[SectionId, RichDoc, string, boolean]> = [
    ["reflection", content.reflection, H.reflection, false],
    ["discussion", content.discussion, H.discussion, true],
    ["practice", content.practice, H.practice, false],
    ["prayer", content.prayer, H.prayer, false],
  ];
  for (const [id, doc, heading, emphasis] of rich) {
    if (!on(id)) continue;
    const pages = paginateDoc(doc, charBudget("rich", { widthPx, size: settings.size, simple: settings.simple }));
    if (pages.length === 0) continue;
    add(id, SECTION_LABELS[id], pages.map((page) => ({ kind: "rich" as const, heading, doc: page, emphasis })));
  }
  return slides;
}

/**
 * After the slide list is rebuilt (text size changed, window resized, a section
 * switched off), finds the slide that best matches where the teacher was.
 */
export function equivalentIndex(prev: Pick<Slide, "section" | "page" | "pageCount"> | undefined, next: Slide[]): number {
  if (!prev || next.length === 0) return 0;
  const same = next.map((s, i) => ({ s, i })).filter(({ s }) => s.section === prev.section);
  if (same.length > 0) {
    const fraction = prev.pageCount > 0 ? prev.page / prev.pageCount : 0;
    return same[Math.min(same.length - 1, Math.floor(fraction * same.length))]!.i;
  }
  const order = SECTION_IDS.indexOf(prev.section);
  const later = next.findIndex((s) => SECTION_IDS.indexOf(s.section) > order);
  return later === -1 ? next.length - 1 : later;
}
