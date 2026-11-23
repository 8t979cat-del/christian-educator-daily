import { describe, expect, it } from "vitest";
import { describeUsed, findOverlap, passageSpan } from "@/lib/content/passages";

describe("passage overlap", () => {
  it("reads every reference shape", () => {
    expect(passageSpan("Phil 4:6-7")).toEqual({ book: "Philippians", from: 4006, to: 4007 });
    expect(passageSpan("Psalm 23")).toEqual({ book: "Psalms", from: 23000, to: 23999 });
    expect(passageSpan("John 3:16")).toEqual({ book: "John", from: 3016, to: 3016 });
    expect(passageSpan("Romans 8:28-9:2")).toEqual({ book: "Romans", from: 8028, to: 9002 });
    expect(passageSpan("Matthew 5-7")).toEqual({ book: "Matthew", from: 5000, to: 7999 });
    expect(passageSpan("Jude 5")).toMatchObject({ book: "Jude", from: 1005, to: 1005 });
    expect(passageSpan("not a passage")).toBeNull();
  });

  it("finds a shared verse, and only in the same book", () => {
    const used = [
      { reference: "Philippians 4:4–7", title: "Rejoice" },
      { reference: "Psalm 23", title: "Shepherd" },
    ];
    expect(findOverlap("Philippians 4:6-7", used)?.title).toBe("Rejoice");
    expect(findOverlap("Psalm 23:4", used)?.title).toBe("Shepherd");
    expect(findOverlap("Philippians 4:8-9", used)).toBeNull();
    expect(findOverlap("Psalm 24:1", used)).toBeNull();
    expect(findOverlap("Colossians 4:6", used)).toBeNull();
  });

  it("lists used passages for the AI, newest first and capped", () => {
    expect(describeUsed([{ reference: "John 1:1", title: "Word" }, { reference: "", title: "x" }, { reference: "Mark 1:1", title: "" }], 5)).toEqual(["John 1:1 (“Word”)", "Mark 1:1"]);
  });
});
