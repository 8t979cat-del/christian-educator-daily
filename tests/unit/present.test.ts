import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS, PRESENT_THEMES, SECTION_IDS, buildSlides, contrastRatio, cutPoints, equivalentIndex, floorPx, pageCapacity,
  paginateDoc, parseSettings, splitPassage, type PresentContent, type Stage,
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
  levels: {},
  ...over,
});

// Slide boxes as measured on real screens (the full screen, less the slide margins).
const XGA: Stage = { width: 920, height: 700 };
const HD: Stage = { width: 1152, height: 648 };
const FULL_HD: Stage = { width: 1728, height: 1000 };
const PHONE: Stage = { width: 350, height: 780 };

const PSALM_23 = [
  "1 The LORD is my shepherd; I shall not want.",
  "2 He maketh me to lie down in green pastures: he leadeth me beside the still waters.",
  "3 He restoreth my soul: he leadeth me in the paths of righteousness for his name's sake.",
  "4 Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.",
  "5 Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.",
  "6 Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.",
].join("\n");

const typicalDay = () => content({
  scripture: { reference: "Psalm 23", translationLabel: "King James Version (KJV)", text: PSALM_23, notice: "KJV, public domain in the United States." },
  reflection: doc(
    "Every teacher knows the moment: you have explained it twice, and the faces in front of you are still blank. The pull is to hurry, to say it louder, to move on.",
    "The shepherd in this psalm does not hurry the sheep. He leads them beside still waters, at their pace. Patience is not waiting for the lesson to be over; it is staying with the people in front of you.",
  ),
  practice: doc("Today, when someone is struggling, slow down and ask one more question before you answer."),
  prayer: doc("Lord, thank you for leading us gently. Help us to be patient with each other and with ourselves today. Amen."),
});

describe("buildSlides", () => {
  const wide = HD;
  it("orders the lesson: opener, Scripture, reflection, discussion, then practice with the closing prayer", () => {
    const slides = buildSlides(content({ scripture: { reference: "Galatians 6:9", translationLabel: null, text: "Short verse.", notice: null } }), DEFAULT_SETTINGS, wide);
    expect(slides.map((s) => s.sections)).toEqual([["theme", "title"], ["scripture"], ["reflection"], ["discussion"], ["practice", "prayer"]]);
    const last = slides.at(-1)!.body;
    expect(last.kind === "rich" && last.parts.map((p) => p.heading)).toEqual(["Put it into practice", "Closing prayer"]);
  });

  it("fits a typical day on five slides on a projector, a laptop and a large screen", () => {
    for (const stage of [XGA, HD, FULL_HD]) expect(buildSlides(typicalDay(), DEFAULT_SETTINGS, stage)).toHaveLength(5);
  });

  it("keeps a whole psalm on one slide on a 1024x768 projector", () => {
    expect(buildSlides(typicalDay(), DEFAULT_SETTINGS, XGA).filter((s) => s.section === "scripture")).toHaveLength(1);
  });

  it("puts the whole passage on the slides, in order, however long it is", () => {
    const slides = buildSlides(content(), DEFAULT_SETTINGS, wide);
    const scripture = slides.filter((s) => s.section === "scripture");
    expect(scripture.length).toBeGreaterThan(1);
    expect(scripture.every((s) => s.pageCount === scripture.length)).toBe(true);
    const shown = scripture.map((s) => (s.body.kind === "scripture" ? s.body.text : "")).join(" ");
    expect(words(shown)).toEqual(words(CORINTHIANS));
  });

  it("splits only when text would fall below the readable size: small screens and larger text need more slides", () => {
    const count = (stage: Stage, size: number) => buildSlides(content(), { ...DEFAULT_SETTINGS, size }, stage).filter((s) => s.section === "scripture").length;
    expect(count(PHONE, 1)).toBeGreaterThan(count(HD, 1));
    expect(count(HD, 4)).toBeGreaterThan(count(HD, 1));
    // A bigger screen of the same shape is seen from the same distance: same slides, larger letters.
    expect(count({ width: HD.width * 1.5, height: HD.height * 1.5 }, 1)).toBe(count(HD, 1));
  });

  it("separates practice and prayer when they are too long to share a slide", () => {
    const long = doc(Array.from({ length: 14 }, (_, i) => `Sentence ${i} of a long prayer for the class.`).join(" "));
    const slides = buildSlides(content({ prayer: long }), DEFAULT_SETTINGS, XGA);
    expect(slides.some((s) => s.sections.includes("practice") && s.sections.includes("prayer"))).toBe(false);
    expect(slides.some((s) => s.section === "prayer")).toBe(true);
  });

  it("lets the teacher drop sections", () => {
    const settings = { ...DEFAULT_SETTINGS, sections: { ...DEFAULT_SETTINGS.sections, theme: false, practice: false, reflection: false } };
    const sections = buildSlides(content(), settings, wide).flatMap((s) => s.sections);
    expect([...new Set(sections)]).toEqual(["title", "scripture", "discussion", "prayer"]);
  });

  it("shows the theme on its own when the title is switched off", () => {
    const settings = { ...DEFAULT_SETTINGS, sections: { ...DEFAULT_SETTINGS.sections, title: false } };
    const [opener] = buildSlides(content(), settings, wide);
    expect(opener!.body).toMatchObject({ kind: "opener", heading: "Patience in the Classroom", theme: null, dayLabel: "Day 1 of 5" });
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

  it("skips empty sections, and the theme when there is none", () => {
    const slides = buildSlides(content({ theme: null, practice: { type: "doc", content: [] } }), DEFAULT_SETTINGS, wide);
    const sections = slides.flatMap((s) => s.sections);
    expect(sections).not.toContain("theme");
    expect(sections).not.toContain("practice");
    expect(slides.at(-1)!.sections).toEqual(["prayer"]);
  });

  it("the youngest reading level gets friendlier headings", () => {
    const young = buildSlides(content(), { ...DEFAULT_SETTINGS, band: "k2" }, wide);
    const headings = young.flatMap((s) => (s.body.kind === "rich" ? s.body.parts.map((p) => p.heading) : []));
    expect(headings).toContain("Let’s pray");
  });

  it("shows the class's own version of the text for its reading level, and the standard text elsewhere", () => {
    const c = content({ levels: { k2: { reflection: doc("God is patient with us."), prayer: doc("Thank you, God. Amen.") } } });
    const plain = (slides: ReturnType<typeof buildSlides>) =>
      slides.flatMap((s) => (s.body.kind === "rich" ? s.body.parts.map((p) => richTextToPlain(p.doc)) : [])).join(" | ");
    const k2 = plain(buildSlides(c, { ...DEFAULT_SETTINGS, band: "k2" }, wide));
    expect(k2).toContain("God is patient with us.");
    expect(k2).toContain("Thank you, God. Amen.");
    // Not written for K-2: the standard discussion question and practical step.
    expect(k2).toContain("When have you had to wait for something?");
    const g912 = plain(buildSlides(c, { ...DEFAULT_SETTINGS, band: "g912" }, wide));
    expect(g912).toContain("A short reflection.");
    expect(plain(buildSlides(c, DEFAULT_SETTINGS, wide))).toContain("A short reflection.");
  });

  it("a short K-2 version stays on as few slides as the standard text, even with its larger letters", () => {
    const day = typicalDay();
    const c = { ...day, levels: { k2: {
      reflection: doc("Sometimes learning takes a long time. That is okay!", "A shepherd walks slowly so every sheep can keep up. God is patient with us like that."),
      discussion_question: doc("When did someone wait for you?"),
      practical_application: doc("Today, wait kindly for a friend."),
      prayer: doc("Dear God, help me be patient with my friends. Amen."),
    } } };
    for (const stage of [XGA, HD]) {
      expect(buildSlides(c, { ...DEFAULT_SETTINGS, band: "k2" }, stage).length).toBeLessThanOrEqual(buildSlides(day, DEFAULT_SETTINGS, stage).length);
    }
  });

  it("gives every slide a unique key", () => {
    const keys = buildSlides(content(), DEFAULT_SETTINGS, PHONE).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("legibility floor and page capacity", () => {
  it("never lets text fall below about 1/22 of the screen height on a projector", () => {
    expect(floorPx(XGA, { size: 1, band: null })).toBeGreaterThanOrEqual(31);
    expect(floorPx(HD, { size: 1, band: "g912" })).toBeGreaterThanOrEqual(29);
  });
  it("raises the floor for larger text and younger readers, and holds less text per slide", () => {
    const base = pageCapacity("rich", HD, { size: 1, band: "g68" });
    expect(pageCapacity("rich", HD, { size: 3, band: "g68" })).toBeLessThan(base);
    expect(pageCapacity("rich", HD, { size: 1, band: "k2" })).toBeLessThan(pageCapacity("rich", HD, { size: 1, band: "g35" }));
    expect(pageCapacity("rich", HD, { size: 1, band: "g35" })).toBeLessThan(base);
    expect(pageCapacity("rich", { width: 100, height: 100 }, { size: 4, band: "k2" })).toBeGreaterThanOrEqual(60);
  });
});

describe("equivalentIndex", () => {
  it("keeps the teacher on the same section when slides are rebuilt", () => {
    const before = buildSlides(content(), DEFAULT_SETTINGS, HD);
    const at = before.find((s) => s.section === "discussion")!;
    const after = buildSlides(content(), { ...DEFAULT_SETTINGS, size: 3 }, HD);
    expect(after[equivalentIndex(at, after)]!.section).toBe("discussion");
  });
  it("moves to the next section when the current one is switched off", () => {
    const before = buildSlides(content(), DEFAULT_SETTINGS, HD);
    const at = before.find((s) => s.section === "reflection")!;
    const after = buildSlides(content(), { ...DEFAULT_SETTINGS, sections: { ...DEFAULT_SETTINGS.sections, reflection: false } }, HD);
    expect(after[equivalentIndex(at, after)]!.section).toBe("discussion");
  });
  it("defaults to the first slide", () => {
    expect(equivalentIndex(undefined, buildSlides(content(), DEFAULT_SETTINGS, HD))).toBe(0);
  });
});

describe("settings", () => {
  it("falls back to defaults for junk and keeps valid values", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ theme: "neon", size: 99, sections: { theme: "no" } })).toEqual(DEFAULT_SETTINGS);
    const parsed = parseSettings({ theme: "dark", size: 3, band: "g68", showReference: false, sections: { practice: false } });
    expect(parsed).toMatchObject({ theme: "dark", size: 3, band: "g68", showReference: false });
    expect(parsed.sections.practice).toBe(false);
    expect(parsed.sections.title).toBe(true);
  });
  it("carries a saved 'younger students' switch over as the K-2 reading level", () => {
    expect(parseSettings({ simple: true }).band).toBe("k2");
    expect(parseSettings({ simple: false }).band).toBeNull();
    expect(parseSettings({ band: "g13" }).band).toBeNull();
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
