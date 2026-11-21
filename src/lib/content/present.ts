/**
 * Classroom presentation: pure logic, no React and no browser APIs, so it can be
 * unit tested. It turns a devotional into a list of slides, splits long Scripture
 * and long text across several slides so everything stays readable from the back of
 * a room, and holds the display settings and colour themes.
 */
import { isBand, textForBand, type GradeBand, type Levels } from "./levels";
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
  white: { label: "White", bg: "#ffffff", fg: "#111111", accent: "#a31d16", muted: "#333333" },
  cream: { label: "Paper", bg: "#fbfaf6", fg: "#161616", accent: "#a31d16", muted: "#363636" },
  dark: { label: "Bookcloth", bg: "#141f36", fg: "#ffffff", accent: "#d4b25e", muted: "#d9dce4" },
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
  /** The students' reading level. Null until the teacher chooses: the standard text is shown. */
  band: GradeBand | null;
  /** The class comment board (a trial feature): off unless the teacher turns it on. */
  comments: boolean;
  sections: Record<SectionId, boolean>;
  showReference: boolean;
  showTranslation: boolean;
};

export const DEFAULT_SETTINGS: PresentSettings = {
  theme: "white",
  size: DEFAULT_SIZE,
  band: null,
  comments: false,
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
    // Settings saved before reading levels had a single "younger students" switch.
    band: isBand(r.band) ? r.band : r.simple === true ? "k2" : d.band,
    comments: r.comments === true,
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

/**
 * How much room a page's text takes. With `lineChars`, every verse (line) is
 * rounded up to whole lines, since each verse starts on a new line and its last
 * line is rarely full.
 */
function pageCost(page: string, lineChars?: number): number {
  if (!lineChars) return page.length;
  return page.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / lineChars)) * lineChars, 0);
}

function packUnits(units: Unit[], max: number, lineChars?: number): string[] {
  const pages: string[] = [];
  let cur = "";
  for (const unit of units) {
    const candidate = cur ? cur + unit.sepBefore + unit.text : unit.text;
    if (cur && pageCost(candidate, lineChars) > max) {
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
export function splitPassage(text: string, max: number, lineChars?: number): string[] {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  if (clean === "") return [];
  const limit = Math.max(40, Math.floor(max));
  if (pageCost(clean, lineChars) <= limit) return [clean];

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

  const pages = packUnits(units, limit, lineChars);
  if (pages.length > 1) {
    // Even out: same page count with a smaller budget, if it still fits.
    const total = pageCost(clean, lineChars);
    const balanced = packUnits(units, Math.min(limit, Math.ceil((total / pages.length) * 1.15)), lineChars);
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
  /** The standard version of the text. */
  reflection: RichDoc;
  discussion: RichDoc;
  practice: RichDoc;
  prayer: RichDoc;
  /** Versions written for an age band, where an editor has written them. */
  levels: Levels;
};

export type SlidePart = { section: SectionId; heading: string; doc: RichDoc };

export type SlideBody =
  | { kind: "opener"; heading: string; text: string; theme: string | null; dayLabel: string | null }
  | { kind: "scripture"; reference: string | null; translation: string | null; text: string; notice: string | null }
  | { kind: "reference"; reference: string; translation: string | null }
  | { kind: "rich"; parts: SlidePart[]; emphasis: boolean };

export type Slide = {
  key: string;
  /** The first section on the slide. Some slides carry two (the opener, and practice with prayer). */
  section: SectionId;
  sections: SectionId[];
  /** Zero-based page within the section, when a long section spans several slides. */
  page: number;
  pageCount: number;
  /** Short name for screen readers and the progress dots. */
  label: string;
  body: SlideBody;
};

/** The box a slide is drawn in, in CSS pixels. */
export type Stage = { width: number; height: number };

/**
 * The smallest text a slide may use, in pixels: about 1/22 of the screen height,
 * the size that stays readable from the back of a classroom on a projector.
 * Larger text settings and the young-students mode raise it.
 */
/** Younger readers get larger letters: early readers need bigger type, and their versions are shorter. */
export const BAND_TYPE_SCALE: Record<GradeBand, number> = { k2: 1.25, g35: 1.1, g68: 1, g912: 1 };
export const bandScale = (band: GradeBand | null): number => (band ? BAND_TYPE_SCALE[band] : 1);
/** The youngest band gets the friendlier headings. */
export const isYoungest = (band: GradeBand | null): boolean => band === "k2";

export function floorPx(stage: Stage, opts: { size: number; band: GradeBand | null }): number {
  const scale = SIZE_SCALES[opts.size] ?? 1;
  const base = Math.min(stage.height * 0.045, stage.width * 0.06);
  return Math.max(16, base * scale * bandScale(opts.band));
}

/** Measured proportions of the slide typography: average character width and line height, in em. */
const METRICS = {
  // overheadPx: fixed-size text that does not scale with the slide, such as the copyright notice (14px minimum, up to two lines).
  scripture: { charEm: 0.46, lineEm: 1.5, maxWidthEm: 36, overheadEm: 3.2, overheadPx: 0 },
  rich: { charEm: 0.5, lineEm: 1.45, maxWidthEm: 34, overheadEm: 1.6, overheadPx: 0 },
  emphasis: { charEm: 0.5, lineEm: 1.3, maxWidthEm: 26, overheadEm: 1.6, overheadPx: 0 },
} as const;
/** Word wrap, short last lines and paragraph gaps leave some of every page empty. */
const FILL = 0.85;

/**
 * How many characters of one kind of text fit on a slide at the legibility floor.
 * Slides are split only when the text would otherwise have to shrink below that
 * floor, so a short devotional stays on as few slides as possible.
 */
export function pageCapacity(kind: keyof typeof METRICS, stage: Stage, opts: { size: number; band: GradeBand | null; headings?: number }): number {
  return pageGeometry(kind, stage, opts).capacity;
}

/** Characters per line and lines per slide at the legibility floor, and the resulting capacity. */
export function pageGeometry(kind: keyof typeof METRICS, stage: Stage, opts: { size: number; band: GradeBand | null; headings?: number }) {
  const m = METRICS[kind];
  const px = floorPx(stage, opts);
  const lineWidth = Math.min(stage.width, m.maxWidthEm * px);
  const charsPerLine = lineWidth / (m.charEm * px);
  const overhead = m.overheadEm * (opts.headings ?? 1);
  const lines = Math.max(1, Math.floor(((stage.height - m.overheadPx) / px - overhead) / m.lineEm));
  return { charsPerLine, lines, capacity: Math.max(60, Math.round(lines * charsPerLine * FILL)) };
}

/** Splits a rich document into the fewest pages that fit, then evens them out. */
function paginateBalanced(doc: RichDoc, max: number): RichDoc[] {
  const pages = paginateDoc(doc, max);
  if (pages.length < 2) return pages;
  const total = richTextToPlain(doc).length;
  const balanced = paginateDoc(doc, Math.min(max, Math.ceil((total / pages.length) * 1.15)));
  return balanced.length === pages.length ? balanced : pages;
}

const HEADINGS = {
  normal: { reflection: "Reflection", discussion: "Think about it", practice: "Put it into practice", prayer: "Closing prayer", scripture: "Scripture" },
  simple: { reflection: "Let’s think about it", discussion: "Let’s talk", practice: "Let’s try it", prayer: "Let’s pray", scripture: "Let’s read God’s Word" },
} as const;

/**
 * Turns a devotional into slides: an opener (title with the week's theme), the
 * Scripture, the reflection, the discussion question, and one closing slide
 * with the practical step and the prayer. A section continues onto more slides
 * only when it cannot fit at a readable size.
 */
export function buildSlides(content: PresentContent, settings: PresentSettings, stage: Stage): Slide[] {
  const H = isYoungest(settings.band) ? HEADINGS.simple : HEADINGS.normal;
  const opts = { size: settings.size, band: settings.band };
  // The class's own version of the text where one is written, the standard text elsewhere.
  const text = settings.band
    ? textForBand({ reflection: content.reflection, discussion_question: content.discussion, practical_application: content.practice, prayer: content.prayer }, content.levels, settings.band)
    : { reflection: content.reflection, discussion_question: content.discussion, practical_application: content.practice, prayer: content.prayer };
  const slides: Slide[] = [];
  const on = (id: SectionId) => settings.sections[id];

  const add = (sections: SectionId[], label: string, bodies: SlideBody[]) => {
    bodies.forEach((body, page) =>
      slides.push({
        key: `${sections.join("+")}-${page}`,
        section: sections[0]!,
        sections,
        page,
        pageCount: bodies.length,
        label: bodies.length > 1 ? `${label} (${page + 1} of ${bodies.length})` : label,
        body,
      }),
    );
  };

  // Opener: the day's title, with the week's theme beneath it. One slide, not two.
  const showTitle = on("title") && content.title.trim() !== "";
  const showTheme = on("theme") && content.theme !== null;
  if (showTitle || showTheme) {
    const theme = showTheme ? content.theme : null;
    const sections: SectionId[] = [...(showTheme ? (["theme"] as const) : []), ...(showTitle ? (["title"] as const) : [])];
    add(sections, showTitle ? SECTION_LABELS.title : SECTION_LABELS.theme, [{
      kind: "opener",
      heading: showTitle ? content.title : theme!.title,
      text: showTitle ? content.topic : theme!.summary,
      theme: showTitle && theme ? theme.title : null,
      dayLabel: theme?.dayLabel || null,
    }]);
  }

  if (on("scripture")) {
    const s = content.scripture;
    const translation = settings.showTranslation ? s.translationLabel : null;
    if (s.text) {
      // Scripture is the one passage every age shares, usually read aloud together, so it keeps the
      // standard floor rather than splitting further for younger readers. It still grows when it fits.
      // Counted in whole lines: each verse starts a new line, so short verses take more room than their letters.
      const g = pageGeometry("scripture", stage, { ...opts, band: null });
      const lineChars = Math.max(10, Math.floor(g.charsPerLine * 0.97));
      const pages = splitPassage(s.text, g.lines * lineChars, lineChars);
      add(["scripture"], SECTION_LABELS.scripture, pages.map((text) => ({
        kind: "scripture" as const,
        reference: settings.showReference ? s.reference || null : null,
        translation,
        text,
        notice: s.notice,
      })));
    } else if (s.reference) {
      // Text we may not display: the reference is all the class has to go on, so it is always shown.
      add(["scripture"], SECTION_LABELS.scripture, [{ kind: "reference", reference: s.reference, translation }]);
    }
  }

  const richSection = (id: SectionId, doc: RichDoc, heading: string, emphasis: boolean) => {
    if (!on(id)) return;
    const pages = paginateBalanced(doc, pageCapacity(emphasis ? "emphasis" : "rich", stage, opts));
    if (pages.length === 0) return;
    add([id], SECTION_LABELS[id], pages.map((page) => ({ kind: "rich" as const, parts: [{ section: id, heading, doc: page }], emphasis })));
  };
  richSection("reflection", text.reflection, H.reflection, false);
  richSection("discussion", text.discussion_question, H.discussion, true);

  // Respond: the practical step and the prayer share one closing slide when they fit together.
  const respond = ([["practice", text.practical_application, H.practice], ["prayer", text.prayer, H.prayer]] as const)
    .filter(([id, doc]) => on(id) && richTextToPlain(doc).trim() !== "");
  const together = respond.reduce((n, [, doc]) => n + richTextToPlain(doc).length, 0);
  if (respond.length === 2 && together <= pageCapacity("rich", stage, { ...opts, headings: 2 })) {
    add(["practice", "prayer"], `${SECTION_LABELS.practice} and ${SECTION_LABELS.prayer.toLowerCase()}`, [{
      kind: "rich",
      parts: respond.map(([id, doc, heading]) => ({ section: id, heading, doc })),
      emphasis: false,
    }]);
  } else {
    for (const [id, doc, heading] of respond) richSection(id, doc, heading, false);
  }
  return slides;
}

/**
 * After the slide list is rebuilt (text size changed, window resized, a section
 * switched off), finds the slide that best matches where the teacher was.
 */
export function equivalentIndex(prev: Pick<Slide, "section" | "page" | "pageCount"> | undefined, next: Slide[]): number {
  if (!prev || next.length === 0) return 0;
  const same = next.map((s, i) => ({ s, i })).filter(({ s }) => s.sections.includes(prev.section));
  if (same.length > 0) {
    const fraction = prev.pageCount > 0 ? prev.page / prev.pageCount : 0;
    return same[Math.min(same.length - 1, Math.floor(fraction * same.length))]!.i;
  }
  const order = SECTION_IDS.indexOf(prev.section);
  const later = next.findIndex((s) => SECTION_IDS.indexOf(s.section) > order);
  return later === -1 ? next.length - 1 : later;
}
