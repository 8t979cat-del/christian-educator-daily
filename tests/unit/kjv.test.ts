import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { kjvPassage } = await import("@/lib/bible/kjv");
const { BOOK_NAMES } = await import("@/lib/content/scripture");

describe("bundled KJV", () => {
  it("returns whole chapters, verse ranges and single verses, numbered", () => {
    const psalm = kjvPassage("Psalm 23")!;
    expect(psalm.verses).toBe(6);
    expect(psalm.text.split("\n")[0]).toBe("1 The LORD is my shepherd; I shall not want.");
    expect(kjvPassage("gal 6:9")!.text).toBe("9 And let us not be weary in well doing: for in due season we shall reap, if we faint not.");
    expect(kjvPassage("Galatians 6:9-10")!.verses).toBe(2);
    expect(kjvPassage("Matthew 5:43–6:1")!.text.split("\n").at(-1)).toMatch(/^1 Take heed/);
  });
  it("refuses invalid, missing or over-long passages instead of guessing", () => {
    expect(kjvPassage("Hezekiah 3:1")).toBeNull();
    expect(kjvPassage("John 3:99")).toBeNull();
    expect(kjvPassage("Psalm 119")).toBeNull(); // 176 verses
  });
  it("covers every book the app knows", () => {
    for (const name of BOOK_NAMES) expect(kjvPassage(`${name} 1:1`), name).not.toBeNull();
  });
});

describe("bundled WEB and ASV", async () => {
  const { biblePassage } = await import("@/lib/bible/kjv");
  it("give the same passage in each translation's own words", () => {
    expect(biblePassage("web", "Galatians 6:9")!.text).toBe("9 Let’s not be weary in doing good, for we will reap in due season, if we don’t give up.");
    expect(biblePassage("asv", "Galatians 6:9")!.text).toBe("9 And let us not be weary in well-doing: for in due season we shall reap, if we faint not.");
    expect(biblePassage("web", "Psalm 23")!.verses).toBe(6);
    expect(biblePassage("asv", "Psalm 23")!.verses).toBe(6);
  });
  it("cover every book, and skip verses a translation leaves out", () => {
    for (const code of ["web", "asv"] as const) {
      for (const name of BOOK_NAMES) expect(biblePassage(code, `${name} 1:1`), `${code} ${name}`).not.toBeNull();
    }
    expect(biblePassage("asv", "Matthew 17:20-22")!.text.split("\n").map((l) => l.split(" ")[0])).toEqual(["20", "22"]);
  });
  it("allow a longer passage when asked", () => {
    expect(biblePassage("web", "Psalm 119:1-40")).toBeNull();
    expect(biblePassage("web", "Psalm 119:1-40", 80)!.verses).toBe(40);
  });
});
