import { describe, expect, it } from "vitest";
import { docToText, textToDoc } from "@/lib/content/editable";
import { bandsWithVersion, textForBand, toLevels } from "@/lib/content/levels";
import { richTextToPlain } from "@/lib/content/richtext";
import { devotionalSchema, levelFieldName } from "@/lib/content/schemas";

const doc = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }] });

describe("toLevels", () => {
  it("keeps valid versions and drops unknown bands, unknown fields, empty text and junk", () => {
    const levels = toLevels({
      k2: { reflection: doc("Short and kind."), sermon: doc("no"), prayer: { type: "doc", content: [] } },
      g13: { reflection: doc("no such band") },
      g912: "not an object",
    });
    expect(Object.keys(levels)).toEqual(["k2"]);
    expect(Object.keys(levels.k2!)).toEqual(["reflection"]);
    expect(toLevels(null)).toEqual({});
    expect(toLevels([1, 2])).toEqual({});
    expect(bandsWithVersion(levels)).toEqual(["k2"]);
  });
});

describe("textForBand", () => {
  const standard = { reflection: doc("Standard reflection"), discussion_question: doc("Standard question"), practical_application: doc("Standard step"), prayer: doc("Standard prayer") };
  it("uses the band's own text field by field, falling back to the standard text", () => {
    const t = textForBand(standard, { g35: { reflection: doc("Grades 3-5 reflection") } }, "g35");
    expect(richTextToPlain(t.reflection)).toBe("Grades 3-5 reflection");
    expect(richTextToPlain(t.prayer)).toBe("Standard prayer");
    expect(t.written).toEqual(["reflection"]);
    expect(textForBand(standard, {}, "k2").written).toEqual([]);
  });
});

describe("devotional form: reading levels", () => {
  const base = {
    title: "", devotionalDate: "2040-01-05", themeId: "", dailyTopic: "", categorySlug: "", scriptureReference: "",
    translationCode: "", reflection: JSON.stringify(doc("Standard")), prayer: JSON.stringify(doc("Standard")),
    discussionQuestion: JSON.stringify(doc("Standard")), practicalApplication: JSON.stringify(doc("Standard")),
    audience: "", gradeLevels: [], educationalCategory: "", authorName: "",
  };
  it("collects each band's written fields and leaves unwritten bands out", () => {
    const parsed = devotionalSchema.parse({
      ...base,
      [levelFieldName("k2", "reflection")]: JSON.stringify(doc("For the youngest")),
      [levelFieldName("k2", "prayer")]: JSON.stringify({ type: "doc", content: [] }),
      [levelFieldName("g68", "discussion_question")]: "",
    });
    expect(Object.keys(parsed.levels)).toEqual(["k2"]);
    expect(richTextToPlain(parsed.levels.k2!.reflection!)).toBe("For the youngest");
    expect(parsed.levels.k2!.prayer).toBeUndefined();
  });
  it("rejects a band's text that is not valid rich text", () => {
    const result = devotionalSchema.safeParse({ ...base, [levelFieldName("g912", "reflection")]: "{not json" });
    expect(result.success).toBe(false);
  });
});

describe("plain-text editing of presentation text", () => {
  it("round-trips paragraphs and flattens lists to paragraphs", () => {
    expect(docToText(textToDoc("First paragraph.\n\nSecond one.\n\n\n"))).toBe("First paragraph.\n\nSecond one.");
    const list = { type: "doc" as const, content: [{ type: "bulletList" as const, content: [{ type: "listItem" as const, content: [doc("One")["content"][0]!] }] }] };
    expect(docToText(list as never)).toBe("One");
    expect(textToDoc("   ").content).toHaveLength(0);
  });
});
