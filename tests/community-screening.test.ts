import { describe, expect, it } from "vitest";
import { screenGroupText, screenPublicText } from "@/lib/community/screening";
import { contributionSchema } from "@/lib/community/schemas";

const id = "4f0a62a6-33f2-4b3a-9ec7-2d9fa0e57a11";

describe("public screening", () => {
  it.each([
    "Email me at sam@school.org",
    "Call 555-123-4567 tonight",
    "See https://example.com/lesson",
    "check www.shop.example",
    "visit teachpay.com/deal",
    "My student Jamie was struggling today",
    "a fourth-grade student named Maria stayed after class",
    "our child Sam Lopez is anxious",
    "One of my pupils, Ahmed, lost his father",
  ])("blocks: %s", (text) => {
    expect(screenPublicText(text).ok).toBe(false);
  });

  it.each([
    "I prayed Psalm 23 with my class and it settled the room.",
    "One of my students struggled with anxiety, so I slowed down.",
    "Our student council led chapel this week.",
    "A child who feels unseen needs a teacher who notices.",
    "Verses 3 to 16 of John 3 changed how I begin the day.",
    "My student body is 400 kids and it is a joy.",
    "Lord, give me patience with the students who test me.",
  ])("allows: %s", (text) => {
    expect(screenPublicText(text)).toEqual({ ok: true });
  });

  it("explains why, kindly", () => {
    const r = screenPublicText("my student Jamie");
    expect(r.ok === false && r.reason).toMatch(/describe the situation/i);
  });
});

describe("group screening", () => {
  it("allows contact details and links in a private group but still protects student names", () => {
    expect(screenGroupText("The meeting link is https://meet.example.com/abc")).toEqual({ ok: true });
    expect(screenGroupText("my student Jamie is struggling").ok).toBe(false);
  });
});

describe("contribution validation", () => {
  const base = { devotionalId: id, kind: "reflection", body: "Hello", visibility: "named" };
  it("accepts an ordinary reflection", () => {
    expect(contributionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects empty and over-long text", () => {
    expect(contributionSchema.safeParse({ ...base, body: "   " }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, body: "x".repeat(4001) }).success).toBe(false);
  });
  it("only prayers have titles or special visibility", () => {
    expect(contributionSchema.safeParse({ ...base, title: "T" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, visibility: "anonymous" }).success).toBe(false);
  });
  it("a shared prayer requires the reminder to be acknowledged; a private one does not", () => {
    const prayer = { ...base, kind: "prayer" };
    expect(contributionSchema.safeParse(prayer).success).toBe(false);
    expect(contributionSchema.safeParse({ ...prayer, reminderAcknowledged: true }).success).toBe(true);
    expect(contributionSchema.safeParse({ ...prayer, visibility: "private" }).success).toBe(true);
  });
  it("rejects unknown kinds and malformed ids", () => {
    expect(contributionSchema.safeParse({ ...base, kind: "post" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, devotionalId: "nope" }).success).toBe(false);
  });
});
