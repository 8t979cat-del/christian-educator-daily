import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/school")).toBe("/school");
    expect(safeNextPath("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });
  it.each([
    "//evil.com",
    "https://evil.com",
    "http://evil.com/today",
    "/\\evil.com",
    "\\\\evil.com",
    "javascript:alert(1)",
    "/ok\nSet-Cookie: a=b",
    "",
    "today",
  ])("rejects %j", (value) => {
    expect(safeNextPath(value)).toBe("/today");
  });
  it("rejects non-strings and honours the fallback", () => {
    expect(safeNextPath(undefined)).toBe("/today");
    expect(safeNextPath(["/a"], "/home")).toBe("/home");
  });
});
