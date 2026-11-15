import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS, PRESENT_THEMES, SECTION_IDS, buildSlides, charBudget, contrastRatio, cutPoints, equivalentIndex,
  paginateDoc, parseSettings, splitPassage, type PresentContent,
} from "@/lib/content/present";
import { richTextToPlain, type RichDoc } from "@/lib/content/richtext";

const p = (text: string) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text }] });
const doc = (...texts: string[]): RichDoc => ({ type: "doc", content: texts.map(p) });
const words = (s: string) => s.split(/\s+/).filter(Boolean);

// 1 Corinthians 13 (KJV, public domain), one verse per line. About 1,700 characters.
const CORINTHIANS = [
  "1 Though I speak with the tongues of men and of angels, and have not charity, I am become as sounding brass, or a tinkling cymbal.",
  "2 And though I have the gift of prophecy, and understand all mysteries, and all knowledge; and though I have all faith, so that I could remove mountains, and have not charity, I am nothing.",
  "3 And though I bestow all my goods to feed the poor, and though I give my body to be burned, and have not charity, it profiteth me nothing.",
  "4 Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,",
  "5 Doth not behave itself unseemly, seeketh not her own, is not easily provoked, thinketh no evil;",
  "6 Rejoiceth not in iniquity, but rejoiceth in the truth;",
  "7 Beareth all things, believeth all things, hopeth all things, endureth all things.",
  "8 Charity never faileth: but whether there be prophecies, they shall fail; whether there be tongues, they shall cease; whether there be knowledge, it shall vanish away.",
  "9 For we know in part, and we prophesy in part.",
  "10 But when that which is perfect is come, then that which is in part shall be done away.",
  "11 When I was a child, I spake as a child, I understood as a child, I thought as a child: but when I became a man, I put away childish things.",
  "12 For now we see through a glass, darkly; but then face to face: now I know in part; but then shall I know even as also I am known.",
  "13 And now abideth faith, hope, charity, these three; but the greatest of these is charity.",
].join("\n");

describe("splitPassage", () => {
  it("keeps a short passage on one page", () => {
    expect(splitPassage("And let us not be weary in well doing.", 500)).toEqual(["And let us not be weary in well doing."]);
    expect(splitPassage("   ", 500)).toEqual([]);
  });

  it.each([120, 280, 450, 700])("never loses, repeats or reorders a word, and respects the limit (max %i)", (max) => {
    const pages = splitPassage(CORINTHIANS, max);
    expect(words(pages.join(" "))).toEqual(words(CORINTHIANS));
    // A page may only exceed the limit if it is one unbreakable word.
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(Math.max(max, 40));
  });

  it("breaks between verses when it can, so a verse is not split without need", () => {
    const pages = splitPassage(CORINTHIANS, 700);
    for (const page of pages) expect(page.split("\n").every((line) => /^\d+ /.test(line))).toBe(true);
  });

  it("splits a single very long line at sentence, then clause, then word boundaries", () => {
    const longLine = "First sentence goes here. Second sentence, with a clause; and another clause. " .repeat(20).trim();
    const pages = splitPassage(longLine, 150);
    expect(pages.length).toBeGreaterThan(3);
    expect(words(pages.join(" "))).toEqual(words(longLine));
    for (const page of pages) expect(page.length).toBeLessThanOrEqual(150);
    // Mid-paragraph pieces are joined with spaces, not turned into new lines.
    expect(pages.every((pg) => !pg.includes("\n"))).toBe(true);
  });

  it("handles text with no spaces at all", () => {
    const pages = splitPassage("x".repeat(500), 200);
    expect(pages.join("")).toBe("x".repeat(500));
  });

  it("evens out pages instead of leaving a one-line stub", () => {
    const pages = splitPassage(CORINTHIANS, 800);
    const sizes = pages.map((x) => x.length);
    expect(Math.min(...sizes)).toBeGreaterThan(Math.max(...sizes) * 0.4);
  });
});

describe("cutPoints", () => {
  it("prefers sentence ends over arbitrary cuts", () => {
    const text = "One two three four five six. Seven eight nine ten eleven twelve thirteen.";
    const [first] = cutPoints(text, 40);
    expect(text.slice(0, first).trim().endsWith("six.")).toBe(true);
  });
});

describe("paginateDoc", () => {
  const sentences = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1}, and it carries a little weight.`);

  it("returns no pages for an empty document", () => {
    expect(paginateDoc({ type: "doc", content: [] }, 300)).toEqual([]);
  });

  it("keeps a short document on one page", () => {
    expect(paginateDoc(doc("Short one.", "Short two."), 300)).toHaveLength(1);
  });

  it("keeps all text, in order, across pages that respect the budget", () => {
    const d = doc(sentences.slice(0, 4).join(" "), sentences.slice(4, 8).join(" "), sentences.slice(8).join(" "));
    const pages = paginateDoc(d, 260);
    expect(pages.length).toBeGreaterThan(2);
    expect(words(pages.map(richTextToPlain).join(" "))).toEqual(words(richTextToPlain(d)));
    for (const page of pages) expect(richTextToPlain(page).length).toBeLessThanOrEqual(260);
  });

  it("splits one huge paragraph and keeps bold and italic marks on the right words", () => {
    const d: RichDoc = {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "Alpha beta gamma delta epsilon. " .repeat(8) },
          { type: "text", text: "IMPORTANT WORDS HERE. ", marks: [{ type: "bold" }] },
          { type: "text", text: "Zeta eta theta iota kappa. ".repeat(8) },
        ],
      }],
    };
    const pages = paginateDoc(d, 200);
    expect(pages.length).toBeGreaterThan(2);
    const boldTexts = pages.flatMap((pg) => pg.content.flatMap((b) => (b.type === "paragraph" ? b.content ?? [] : [])))
      .filter((n) => n.type === "text" && n.marks?.some((m) => m.type === "bold")).map((n) => (n.type === "text" ? n.text : ""));
    expect(boldTexts.join("").replace(/\s+/g, " ").trim()).toBe("IMPORTANT WORDS HERE.");
    expect(words(pages.map(richTextToPlain).join(" "))).toEqual(words(richTextToPlain(d)));
  });

  it("splits a long list item by item", () => {
    const item = (t: string) => ({ type: "listItem" as const, content: [p(t)] });
    const d: RichDoc = { type: "doc", content: [{ type: "bulletList", content: Array.from({ length: 10 }, (_, i) => item(`Item number ${i} with some words in it`)) }] };
    const pages = paginateDoc(d, 130);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every((pg) => pg.content.every((b) => b.type === "bulletList"))).toBe(true);
  });

  it("does not leave a heading stranded at the end of a page", () => {
    const d: RichDoc = {
      type: "doc",
      content: [p("a".repeat(150)), { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Heading" }] }, p("b".repeat(150))],
    };
    const pages = paginateDoc(d, 200);
    for (const page of pages.slice(0, -1)) expect(page.content.at(-1)?.type).not.toBe("heading");
  });
});

const content = (over: Partial<PresentContent> = {}): PresentContent => ({
  dateLabel: "Monday, November 16, 2026",
  title: "Patience when the lesson is not landing",
  topic: "Waiting well",
  theme: { title: "Patience in the Classroom", summary: "Five days on steady, gentle teaching.", dayLabel: "Day 1 of 5" },
  scripture: { reference: "1 Corinthians 13", translationLabel: "King James Version (KJV)", text: CORINTHIANS, notice: "KJV, public domain in the United States." },
  reflection: doc("A short reflection."),
  discussion: doc("When have you had to wait for something?"),
  practice: doc("Pause for three breaths before you answer."),
  prayer: doc("Lord, give us patience."),
  ...over,
});

describe("buildSlides", () => {
  const wide = 1280;
  it("orders the lesson: theme, title, Scripture, reflection, discussion, practice, closing prayer", () => {
    const slides = buildSlides(content({ scripture: { reference: "Galatians 6:9", translationLabel: null, text: "Short verse.", notice: null } }), DEFAULT_SETTINGS, wide);
    expect(slides.map((s) => s.section)).toEqual(["theme", "title", "scripture", "reflection", "discussion", "practice", "prayer"]);
    expect(slides.at(-1)!.body).toMatchObject({ kind: "rich", heading: "Closing prayer" });
  });

  it("puts the whole passage on the slides, in order, however long it is", () => {
    const slides = buildSlides(content(), DEFAULT_SETTINGS, wide);
    const scripture = slides.filter((s) => s.section === "scripture");
    expect(scripture.length).toBeGreaterThan(1);
    expect(scripture.every((s) => s.pageCount === scripture.length)).toBe(true);
    const shown = scripture.map((s) => (s.body.kind === "scripture" ? s.body.text : "")).join(" ");
    expect(words(shown)).toEqual(words(CORINTHIANS));
  });

  it("uses more slides when the screen is small or the text is large, so type stays big", () => {
    const count = (w: number, size: number) => buildSlides(content(), { ...DEFAULT_SETTINGS, size }, w).filter((s) => s.section === "scripture").length;
    expect(count(390, 1)).toBeGreaterThan(count(1280, 1));
    expect(count(1280, 3)).toBeGreaterThan(count(1280, 1));
    expect(count(1920, 1)).toBeLessThanOrEqual(count(1280, 1));
  });

  it("lets the teacher drop sections", () => {
    const settings = { ...DEFAULT_SETTINGS, sections: { ...DEFAULT_SETTINGS.sections, theme: false, practice: false, reflection: false } };
    const sections = new Set(buildSlides(content(), settings, wide).map((s) => s.section));
    expect([...sections]).toEqual(["title", "scripture", "discussion", "prayer"]);
  });

  it("hides the reference and translation on request but keeps the copyright notice", () => {
    const slides = buildSlides(content(), { ...DEFAULT_SETTINGS, showReference: false, showTranslation: false }, wide);
    for (const s of slides.filter((x) => x.section === "scripture")) {
      expect(s.body).toMatchObject({ kind: "scripture", reference: null, translation: null, notice: "KJV, public domain in the United States." });
    }
  });

  it("never invents Scripture text: reference-only translations show the reference even if the reference is set to hidden", () => {
    const c = content({ scripture: { reference: "John 3:16", translationLabel: "New International Version (NIV)", text: null, notice: null } });
    const [s] = buildSlides(c, { ...DEFAULT_SETTINGS, showReference: false }, wide).filter((x) => x.section === "scripture");
    expect(s!.body).toEqual({ kind: "reference", reference: "John 3:16", translation: "New International Version (NIV)" });
  });

  it("skips empty sections and a theme slide when there is no theme", () => {
    const slides = buildSlides(content({ theme: null, practice: { type: "doc", content: [] } }), DEFAULT_SETTINGS, wide);
    expect(slides.map((s) => s.section)).not.toContain("theme");
    expect(slides.map((s) => s.section)).not.toContain("practice");
  });

  it("young-students mode: friendlier headings and smaller pieces", () => {
    const long = doc(Array.from({ length: 10 }, (_, i) => `Sentence ${i} is here for the class to read.`).join(" "));
    const normal = buildSlides(content({ reflection: long }), DEFAULT_SETTINGS, wide);
    const simple = buildSlides(content({ reflection: long }), { ...DEFAULT_SETTINGS, simple: true }, wide);
    expect(simple.filter((s) => s.section === "reflection").length).toBeGreaterThan(normal.filter((s) => s.section === "reflection").length);
    expect(simple.map((s) => s.body).filter((b) => b.kind === "rich").map((b) => (b.kind === "rich" ? b.heading : ""))).toContain("Let’s pray");
  });

  it("gives every slide a unique key", () => {
    const keys = buildSlides(content(), DEFAULT_SETTINGS, 390).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("charBudget", () => {
  it("shrinks with bigger text, small screens and simple mode", () => {
    const base = charBudget("scripture", { widthPx: 1280, size: 1, simple: false });
    expect(charBudget("scripture", { widthPx: 1280, size: 3, simple: false })).toBeLessThan(base);
    expect(charBudget("scripture", { widthPx: 500, size: 1, simple: false })).toBeLessThan(base);
    expect(charBudget("scripture", { widthPx: 1280, size: 1, simple: true })).toBeLessThan(base);
    expect(charBudget("scripture", { widthPx: 100, size: 4, simple: true })).toBeGreaterThanOrEqual(60);
  });
});

describe("equivalentIndex", () => {
  it("keeps the teacher on the same section when slides are rebuilt", () => {
    const before = buildSlides(content(), DEFAULT_SETTINGS, 1280);
    const at = before.find((s) => s.section === "discussion")!;
    const after = buildSlides(content(), { ...DEFAULT_SETTINGS, size: 3 }, 1280);
    expect(after[equivalentIndex(at, after)]!.section).toBe("discussion");
  });
  it("moves to the next section when the current one is switched off", () => {
    const before = buildSlides(content(), DEFAULT_SETTINGS, 1280);
    const at = before.find((s) => s.section === "reflection")!;
    const after = buildSlides(content(), { ...DEFAULT_SETTINGS, sections: { ...DEFAULT_SETTINGS.sections, reflection: false } }, 1280);
    expect(after[equivalentIndex(at, after)]!.section).toBe("discussion");
  });
  it("defaults to the first slide", () => {
    expect(equivalentIndex(undefined, buildSlides(content(), DEFAULT_SETTINGS, 1280))).toBe(0);
  });
});

describe("settings", () => {
  it("falls back to defaults for junk and keeps valid values", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ theme: "neon", size: 99, sections: { theme: "no" } })).toEqual(DEFAULT_SETTINGS);
    const parsed = parseSettings({ theme: "dark", size: 3, simple: true, showReference: false, sections: { practice: false } });
    expect(parsed).toMatchObject({ theme: "dark", size: 3, simple: true, showReference: false });
    expect(parsed.sections.practice).toBe(false);
    expect(parsed.sections.title).toBe(true);
  });
  it("does not share state with the defaults", () => {
    parseSettings(null).sections.title = false;
    expect(DEFAULT_SETTINGS.sections.title).toBe(true);
    expect(SECTION_IDS).toHaveLength(7);
  });
});

describe("projector themes", () => {
  it.each(Object.entries(PRESENT_THEMES))("%s: text, muted text and accent all reach 7:1 contrast on the background", (_, t) => {
    for (const colour of [t.fg, t.muted, t.accent]) expect(contrastRatio(colour, t.bg)).toBeGreaterThanOrEqual(7);
  });
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(7);
  });
});
