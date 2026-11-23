import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/auth/form-state";
import { devotionalSchema, themeSchema, translationSchema } from "@/lib/content/schemas";
import { addDays, isMonday, isValidIsoDate, mondayOf, todayIn, zonedTimeToIso } from "@/lib/content/dates";
import { CATEGORIES, STATUSES, editorialStatus, publicationStatus } from "@/lib/content/options";
import {
  EMPTY_DOC, LIMITS, parseRichDoc, richTextToPlain, sanitizeRichDoc, wordCount, type RichDoc,
} from "@/lib/content/richtext";
import { parseReference, passageLookupUrl, scriptureDisplay, type TranslationLicense } from "@/lib/content/scripture";
import { actionsFor, canTransition, missingFields } from "@/lib/content/workflow";

const p = (text: string, marks?: string[]) => ({
  type: "paragraph",
  content: [{ type: "text", text, ...(marks ? { marks: marks.map((type) => ({ type })) } : {}) }],
});
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("rich text sanitizer", () => {
  it("keeps allowed structure and marks", () => {
    const input = doc(
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Title" }] },
      p("Hello", ["bold", "italic"]),
      { type: "bulletList", content: [{ type: "listItem", content: [p("one"), { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p("nested")] }] }] }] },
      { type: "blockquote", content: [p("quoted")] },
    );
    const out = sanitizeRichDoc(input) as RichDoc;
    expect(out).not.toBeNull();
    expect(richTextToPlain(out)).toBe("Title Hello one nested quoted");
    expect(JSON.stringify(out)).not.toContain("start"); // unknown attributes are dropped
  });

  it.each([
    ["a script-ish node", doc({ type: "html", content: "<script>alert(1)</script>" })],
    ["a link mark", doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] })],
    ["an image", doc({ type: "image", attrs: { src: "http://evil/x.png" } })],
    ["a heading level 1", doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "x" }] })],
    ["a code block", doc({ type: "codeBlock", content: [{ type: "text", text: "x" }] })],
    ["text as a number", doc({ type: "paragraph", content: [{ type: "text", text: 5 }] })],
    ["a paragraph inside a paragraph", doc({ type: "paragraph", content: [p("x")] })],
    ["a heading inside a list item", doc({ type: "bulletList", content: [{ type: "listItem", content: [{ type: "heading", attrs: { level: 3 } }] }] })],
    ["an empty list", doc({ type: "bulletList", content: [] })],
    ["a non-doc root", { type: "paragraph" }],
    ["null", null],
    ["an array", []],
  ])("rejects %s", (_name, input) => {
    expect(sanitizeRichDoc(input)).toBeNull();
  });

  it("rejects deep nesting and oversize documents", () => {
    let nested: unknown = p("deep");
    for (let i = 0; i < LIMITS.depth + 2; i++) nested = { type: "blockquote", content: [{ type: "bulletList", content: [{ type: "listItem", content: [nested] }] }] };
    expect(sanitizeRichDoc(doc(nested))).toBeNull();
    expect(sanitizeRichDoc(doc(p("x".repeat(LIMITS.characters + 1))))).toBeNull();
    expect(sanitizeRichDoc(doc(...Array.from({ length: LIMITS.nodes + 1 }, () => ({ type: "paragraph" }))))).toBeNull();
  });

  it("parses form values safely", () => {
    expect(parseRichDoc("")).toEqual(EMPTY_DOC);
    expect(parseRichDoc("not json")).toBeNull();
    expect(parseRichDoc("x".repeat(300_000))).toBeNull();
    expect(parseRichDoc(JSON.stringify(doc(p("ok"))))).not.toBeNull();
    expect(parseRichDoc(undefined)).toEqual(EMPTY_DOC);
  });

  it("counts words and drops empty text nodes", () => {
    const out = sanitizeRichDoc(doc(p("one two three"), { type: "paragraph", content: [{ type: "text", text: "" }] })) as RichDoc;
    expect(wordCount(out)).toBe(3);
  });
});

describe("Scripture references", () => {
  it.each([
    ["Galatians 6:9", "Galatians 6:9"],
    ["gal 6:9-10", "Galatians 6:9–10"],
    ["Gal. 6:9–10", "Galatians 6:9–10"],
    ["1 Corinthians 13:4-7", "1 Corinthians 13:4–7"],
    ["1cor 13:4", "1 Corinthians 13:4"],
    ["I John 4:19", "1 John 4:19"],
    ["First Peter 5:7", "1 Peter 5:7"],
    ["Psalm 23", "Psalm 23"],
    ["psalms 23:1-6", "Psalm 23:1–6"],
    ["Psalm 22-23", "Psalms 22–23"],
    ["Matthew 5:1-7:29", "Matthew 5:1–7:29"],
    ["Song of Songs 2:4", "Song of Solomon 2:4"],
    ["Jude 5", "Jude 1:5"],
    ["Philemon 4-7", "Philemon 1:4–7"],
    ["John 3:16-3:20", "John 3:16–20"],
    ["  John   3 : 16 ", "John 3:16"],
  ])("accepts %j as %j", (input, expected) => {
    const r = parseReference(input);
    expect(r).toMatchObject({ ok: true, normalized: expected });
  });

  it.each([
    "", "   ", "Galatians", "Hezekiah 3:4", "Galatians 7:1", "Psalm 151", "Jude 2:1", "Romans 8:28, 31",
    "Romans 8:28; 9:1", "John 3:0", "John 3:16-10", "John 3:16-3:10", "Matthew 7-5", "<script>", "6:9",
  ])("rejects %j", (input) => {
    expect(parseReference(input).ok).toBe(false);
  });

  it("gives a useful message", () => {
    expect(parseReference("Galatians 7:1")).toEqual({ ok: false, error: "Galatians has 6 chapters." });
  });
});

describe("Scripture display and licensing", () => {
  const pd: TranslationLicense = { code: "kjv", name: "King James Version", license_type: "public_domain", text_allowed: true, attribution: "KJV, public domain." };
  const niv: TranslationLicense = { code: "niv", name: "NIV", license_type: "reference_only", text_allowed: false, attribution: null };
  const licensed: TranslationLicense = { code: "esv", name: "ESV", license_type: "licensed", text_allowed: true, attribution: "ESV® attribution text" };

  it("shows text with attribution when the licence allows it", () => {
    expect(scriptureDisplay("  Be patient.  ", pd)).toEqual({ mode: "text", text: "Be patient.", attribution: "KJV, public domain." });
    expect(scriptureDisplay("x", licensed)).toMatchObject({ mode: "text", attribution: "ESV® attribution text" });
  });
  it("falls back to the reference alone when it cannot show text", () => {
    expect(scriptureDisplay("text", niv)).toEqual({ mode: "reference", reason: "not_licensed" });
    expect(scriptureDisplay("text", null)).toEqual({ mode: "reference", reason: "not_licensed" });
    expect(scriptureDisplay(null, pd)).toEqual({ mode: "reference", reason: "no_text" });
    expect(scriptureDisplay("   ", pd)).toEqual({ mode: "reference", reason: "no_text" });
  });
  it("never shows licensed text that has no attribution", () => {
    expect(scriptureDisplay("x", { ...licensed, attribution: " " })).toEqual({ mode: "reference", reason: "not_licensed" });
  });
  it("builds a safely encoded lookup link", () => {
    const url = new URL(passageLookupUrl("John 3:16 & more", "niv"));
    expect(url.origin).toBe("https://www.biblegateway.com");
    expect(url.searchParams.get("search")).toBe("John 3:16 & more");
    expect(url.searchParams.get("version")).toBe("NIV");
  });
});

describe("workflow table", () => {
  it("has the six statuses and the intended path", () => {
    expect(STATUSES).toHaveLength(6);
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("published", "draft")).toBe(false);
    expect(canTransition("archived", "draft")).toBe(true);
  });
  it("offers only actions the table allows", () => {
    for (const from of STATUSES) for (const a of actionsFor(from)) expect(canTransition(from, a.to)).toBe(true);
  });
  it("splits editorial and publication status", () => {
    expect(editorialStatus("in_review")).toBe("In review");
    expect(publicationStatus("draft")).toBe("Unpublished");
    expect(publicationStatus("scheduled")).toBe("Scheduled");
  });
  it("lists the fifteen categories", () => expect(CATEGORIES).toHaveLength(15));

  it("reports missing fields", () => {
    const d = {
      title: "T", daily_topic: "", category_slug: null, scripture_reference: "Gal 6:9", translation_code: "web",
      reflection: sanitizeRichDoc(doc(p("r"))) as RichDoc, prayer: EMPTY_DOC, discussion_question: EMPTY_DOC,
      practical_application: sanitizeRichDoc(doc(p("a"))) as RichDoc, audience: null, grade_levels: [],
      educational_category: "classroom", author_name: "A",
    };
    expect(missingFields(d)).toEqual(["daily topic", "category", "prayer", "discussion question", "intended audience", "grade level"]);
  });
});

describe("dates", () => {
  it("validates calendar dates", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-2-3")).toBe(false);
  });
  it("finds Mondays and adds days across month ends", () => {
    expect(isMonday("2026-11-16")).toBe(true);
    expect(isMonday("2026-11-17")).toBe(false);
    expect(mondayOf("2026-11-20")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // Sunday belongs to the week before
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("computes today in a time zone", () => {
    const instant = new Date("2026-11-15T03:30:00Z");
    expect(todayIn("America/Los_Angeles", instant)).toBe("2026-11-14");
    expect(todayIn("UTC", instant)).toBe("2026-11-15");
    expect(todayIn("Pacific/Auckland", instant)).toBe("2026-11-15");
  });
  it("converts wall-clock time to an instant, across daylight saving", () => {
    expect(zonedTimeToIso("2026-11-16T06:30", "America/Los_Angeles")).toBe("2026-11-16T14:30:00.000Z"); // PST
    expect(zonedTimeToIso("2026-07-16T06:30", "America/Los_Angeles")).toBe("2026-07-16T13:30:00.000Z"); // PDT
    expect(zonedTimeToIso("2026-03-08T12:00", "America/New_York")).toBe("2026-03-08T16:00:00.000Z"); // day of the switch
    expect(zonedTimeToIso("2026-11-16T06:30", "UTC")).toBe("2026-11-16T06:30:00.000Z");
    expect(zonedTimeToIso("2026-02-30T06:30", "UTC")).toBeNull();
    expect(zonedTimeToIso("2026-11-16T25:00", "UTC")).toBeNull();
    expect(zonedTimeToIso("garbage", "UTC")).toBeNull();
  });
});

describe("devotional form validation", () => {
  const form = (entries: Record<string, string | string[]>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) for (const item of [v].flat()) f.append(k, item);
    return f;
  };
  // Every field the real form always submits (scriptureText is omitted when its textarea is disabled).
  const base = {
    title: "", devotionalDate: "2026-11-16", themeId: "", dailyTopic: "", categorySlug: "", scriptureReference: "",
    translationCode: "", reflection: "", prayer: "", discussionQuestion: "", practicalApplication: "",
    audience: "", educationalCategory: "", authorName: "",
  };
  const spec = { arrays: ["gradeLevels"] };

  it("rejects a post that omits a field the form always sends", () => {
    const { title: _omitted, ...rest } = base;
    expect(parseForm(devotionalSchema, form(rest), spec).ok).toBe(false);
  });

  it("accepts an almost-empty draft, with the Scripture text field absent (disabled)", () => {
    const r = parseForm(devotionalSchema, form(base), spec);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ scriptureText: null, themeId: null, categorySlug: null, gradeLevels: [] });
  });

  it("normalizes the Scripture reference and rejects a bad one", () => {
    const ok = parseForm(devotionalSchema, form({ ...base, scriptureReference: "gal 6:9-10" }), spec);
    expect(ok.ok && ok.data.scriptureReference).toBe("Galatians 6:9–10");
    const bad = parseForm(devotionalSchema, form({ ...base, scriptureReference: "Galatians 9:9" }), spec);
    expect(!bad.ok && bad.state.fieldErrors?.scriptureReference).toMatch(/6 chapters/);
  });

  it("requires a translation when Scripture text is given", () => {
    const r = parseForm(devotionalSchema, form({ ...base, scriptureText: "text" }), spec);
    expect(!r.ok && r.state.fieldErrors?.translationCode).toBeTruthy();
  });

  it("rejects an invalid date, category, grade or forbidden rich text", () => {
    expect(parseForm(devotionalSchema, form({ ...base, devotionalDate: "2026-02-31" }), spec).ok).toBe(false);
    expect(parseForm(devotionalSchema, form({ ...base, categorySlug: "nonsense" }), spec).ok).toBe(false);
    expect(parseForm(devotionalSchema, form({ ...base, gradeLevels: ["g13"] }), spec).ok).toBe(false);
    const evil = JSON.stringify({ type: "doc", content: [{ type: "html", content: "<img onerror=x>" }] });
    const r = parseForm(devotionalSchema, form({ ...base, reflection: evil }), spec);
    expect(!r.ok && r.state.fieldErrors?.reflection).toMatch(/not allowed/);
  });

  it("themes must start on a Monday", () => {
    const t = (weekStart: string) => themeSchema.safeParse({ title: "T", summary: "", weekStart, categorySlug: "" }).success;
    expect(t("2026-11-16")).toBe(true);
    expect(t("2026-11-17")).toBe(false);
  });

  it("licence records follow the same rules as the database", () => {
    const t = (o: object) => translationSchema.safeParse({ code: "esv", name: "ESV", licenseType: "licensed", textAllowed: false, attribution: "", licenseNotes: "", ...o }).success;
    expect(t({})).toBe(true);
    expect(t({ textAllowed: true })).toBe(false); // licensed text needs attribution
    expect(t({ textAllowed: true, attribution: "ESV attribution" })).toBe(true);
    expect(t({ licenseType: "reference_only", textAllowed: true })).toBe(false);
    expect(t({ licenseType: "public_domain", textAllowed: true })).toBe(true);
    expect(t({ code: "Bad Code" })).toBe(false);
  });
});
