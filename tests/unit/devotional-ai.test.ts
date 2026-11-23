import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const parse = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    beta = { messages: { parse } };
  }
  return { default: Anthropic };
});

const { relevelDevotional, writeDevotional, planWeek, writeWeekDay, AiError } = await import("@/lib/ai/devotional-ai");
const { richTextToPlain } = await import("@/lib/content/richtext");
const doc = (t: string) => ({ type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: t }] }] });
const standard = { reflection: doc("Standard reflection."), discussion_question: doc("Q?"), practical_application: doc("Do this."), prayer: doc("Amen.") };

beforeEach(() => {
  parse.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("AI teaching tools", () => {
  it("re-levels with Claude Sonnet 5.5 at low effort, a structured answer and refusal fallback, and returns rich text", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { reflection: ["Short one.", "Short two."], discussion_question: "Who waited for you?", practical_application: "Wait kindly.", prayer: "Thank you, God. Amen." } });
    const v = await relevelDevotional({ title: "T", topic: "Patience", reference: "Psalm 23", scriptureText: "1 The LORD is my shepherd", standard }, "k2");
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.output_config.effort).toBe("low");
    expect(req.fallbacks).toBe("default");
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.output_config.format).toBeTruthy();
    expect(req.messages[0].content).toMatch(/Kindergarten to grade 2/);
    expect(v.reflection.content).toHaveLength(2);
    expect(richTextToPlain(v.prayer)).toBe("Thank you, God. Amen.");
  });

  it("turns refusals, cut-off answers and a missing key into plain messages", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    await expect(writeDevotional(["patience"], "g35")).rejects.toThrow(/declined/);
    parse.mockResolvedValue({ stop_reason: "max_tokens", parsed_output: null });
    await expect(writeDevotional(["patience"], "g35")).rejects.toBeInstanceOf(AiError);
    delete process.env.ANTHROPIC_API_KEY;
    await expect(writeDevotional(["patience"], "g35")).rejects.toThrow(/not set up/);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("asks for a new devotional with the topics and passes back the reference it chose", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { title: "Brave", topic: "Courage", scripture_reference: "Joshua 1:9", reflection: ["Be brave."], discussion_question: "When?", practical_application: "Try.", prayer: "Amen." } });
    const d = await writeDevotional(["courage", "new school"], "g68", ["Psalm 23"]);
    expect(d.reference).toBe("Joshua 1:9");
    expect(parse.mock.calls[0]![0].messages[0].content).toMatch(/courage, new school[\s\S]*Do not use these passages: Psalm 23/);
  });
});

describe("writing a week (editors)", () => {
  const theme = { title: "Courage", summary: "Brave hearts at school.", category: "Courage" };
  const dev = (t: string) => ({ reflection: [`${t} one.`, `${t} two.`], discussion_question: `${t}?`, practical_application: `Do ${t}.`, prayer: `${t}. Amen.` });

  it("plans only the empty days with Claude Opus 5.5, building around the days already written", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: {
      tuesday: { title: "Brave words", topic: "Speaking up", scripture_reference: "Joshua 1:9" },
      friday: { title: "Brave together", topic: "Courage in community", scripture_reference: "Deuteronomy 31:6" },
    } });
    const plan = await planWeek(theme, ["tuesday", "friday"], [{ day: "monday", title: "Fear not", reference: "Isaiah 41:10" }], ["Psalm 27:1"]);
    const req = parse.mock.calls[0]![0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(req.output_config.effort).toBe("medium");
    expect(req.fallbacks).toBe("default");
    expect(req.messages[0].content).toMatch(/Plan these days: tuesday, friday[\s\S]*monday: "Fear not" \(Isaiah 41:10\)[\s\S]*Do not use these passages: Psalm 27:1/);
    expect(plan).toEqual({
      tuesday: { title: "Brave words", topic: "Speaking up", reference: "Joshua 1:9" },
      friday: { title: "Brave together", topic: "Courage in community", reference: "Deuteronomy 31:6" },
    });
  });

  it("writes one day as the grades 6 to 8 standard text plus K-2, 3-5 and 9-12 versions", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { standard: dev("Std"), k2: dev("K2"), g35: dev("G35"), g912: dev("G912") } });
    const day = await writeWeekDay(theme, "monday", { title: "Fear not", topic: "Fear", reference: "Isaiah 41:10" }, "10 Fear thou not", ["monday: Fear not"]);
    const prompt = parse.mock.calls[0]![0].messages[0].content as string;
    expect(prompt).toMatch(/standard: Grades 6 to 8/);
    expect(prompt).toMatch(/k2: Kindergarten to grade 2/);
    expect(prompt).toMatch(/10 Fear thou not/);
    expect(richTextToPlain(day.standard.prayer)).toBe("Std. Amen.");
    expect(Object.keys(day.levels).sort()).toEqual(["g35", "g912", "k2"]);
    expect(richTextToPlain(day.levels.k2.discussion_question)).toBe("K2?");
  });
});
