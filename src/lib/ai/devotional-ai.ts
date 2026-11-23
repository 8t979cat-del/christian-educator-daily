import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { BAND_LONG, type GradeBand, type LevelVersion } from "@/lib/content/levels";
import { richTextToPlain, type RichDoc } from "@/lib/content/richtext";

/**
 * The AI teaching tools: re-leveling a devotional for an age band, and writing a
 * new one from topics a teacher chooses. Everything AI writes is a draft the
 * teacher reads and can edit before it reaches the class screen. The AI never
 * writes Scripture: re-leveling keeps the day's passage, and a new devotional
 * gets its passage text from the bundled public-domain KJV, WEB or ASV (src/lib/bible/kjv.ts).
 */

// Claude Sonnet 5.5: about half the price of the Opus model, and ample for short devotionals at a set length.
const MODEL = "claude-sonnet-5-5";
// Writing a whole week for editors: Claude Opus 5.5 at medium effort. It is used a few times a week at
// most, and a week that holds together (one arc, five distinct passages, four reading levels) repays it.
const WEEK_MODEL = "claude-opus-5-5";

/** The AI tools are available only when the server has an Anthropic API key. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export class AiError extends Error {}

const VOICE = `You write classroom devotionals for Christian schools (Everyday Devotional). Teachers project them for their class.
Voice: warm, calm, clear, quietly scholarly and inspirational. Invitational, never preachy, moralising or performatively holy; never dry.
Stay broadly Christian and ecumenical: no denominational positions, no contested doctrine, no political content.
Never write or paraphrase Scripture as if quoting it; you may refer to what the passage says in your own words.
Never invent facts, statistics, quotations or stories about real people. Never use student names or ask students to share private information.
The prayer speaks to God simply and ends with "Amen."`;

const BAND_GUIDE: Record<GradeBand, string> = {
  k2: "Kindergarten to grade 2 (ages 5 to 8), early readers. Very short sentences of familiar words. Reflection: 2 short paragraphs, 40 to 70 words in all, with one concrete picture a young child knows (home, friends, playground, pets). Question: one short, simple question. Practice: one small thing to do today. Prayer: 1 to 3 short sentences.",
  g35: "Grades 3 to 5 (ages 8 to 11). Clear, friendly sentences. Reflection: 2 paragraphs, 80 to 120 words, with an everyday school example. Question: one open question that invites a personal example. Practice: one specific action for today. Prayer: 2 to 4 sentences.",
  g68: "Grades 6 to 8 (ages 11 to 14). Respectful of their growing independence; no talking down. Reflection: 2 to 3 paragraphs, 110 to 160 words, connecting the passage to friendships, pressure, fairness or identity. Question: one open question with room for honest disagreement. Practice: one concrete step. Prayer: 3 to 4 sentences.",
  g912: "Grades 9 to 12 (ages 14 to 18). Thoughtful and honest; can hold nuance and a little context about the passage. Reflection: 2 to 3 paragraphs, 140 to 200 words. Question: one question that invites real reflection or discussion of meaning. Practice: one concrete step. Prayer: 3 to 5 sentences.",
};

/**
 * Variety. Models drift toward the same few famous passages and the same openings, so every
 * request names the passages already used, asks for range across the whole Bible, and gets a
 * randomly chosen way in.
 */
const VARIETY = "Choose passages from across the whole Bible (law, history, wisdom, psalms, prophets, gospels, letters). Prefer a passage teachers will not have seen many times; use a very familiar one (such as Jeremiah 29:11, Philippians 4:13, Proverbs 3:5-6, Psalm 23, John 3:16 or Romans 8:28) only when it is clearly the best fit.";
const ANGLES = [
  "an everyday school moment (a hallway, lunch, a test, recess, a group project)",
  "a vivid image from nature or the seasons",
  "an honest question a student might really ask",
  "a small story about an ordinary object",
  "a moment from the passage's own setting, told simply",
  "a surprising detail in the passage itself",
  "a feeling students know (nervous, left out, proud, bored, excited)",
  "something from sport, music, art or making things",
] as const;
export const pickAngle = (random: () => number = Math.random) => ANGLES[Math.floor(random() * ANGLES.length)]!;
const usedLine = (used: string[]) =>
  used.length ? `These passages are already used in other devotionals: do not choose any of them or a passage that shares verses with them, and do not reuse their titles: ${used.join("; ")}.` : "";

const Devotional = z.object({
  reflection: z.array(z.string()).describe("Paragraphs of the reflection, in order."),
  discussion_question: z.string(),
  practical_application: z.string(),
  prayer: z.string(),
});

const NewDevotional = Devotional.extend({
  title: z.string().describe("A short title, at most 70 characters."),
  topic: z.string().describe("One line naming what today is about, at most 100 characters."),
  scripture_reference: z.string().describe("One passage, Book chapter:verse-verse, at most 12 verses, e.g. Philippians 4:6-7."),
});

const paragraphs = (texts: string[]): RichDoc => ({
  type: "doc",
  content: texts.map((t) => t.trim()).filter(Boolean).map((t) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: t.slice(0, 2000) }] })),
});

const toVersion = (d: z.infer<typeof Devotional>): Required<LevelVersion> => ({
  reflection: paragraphs(d.reflection.slice(0, 5)),
  discussion_question: paragraphs([d.discussion_question]),
  practical_application: paragraphs([d.practical_application]),
  prayer: paragraphs([d.prayer]),
});

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

async function ask<T extends z.ZodType>(
  schema: T,
  prompt: string,
  // Short writing at a set length: low effort keeps thinking (billed as output) and the wait small.
  { model = MODEL, effort = "low" as "low" | "medium" | "high", system = VOICE } = {},
): Promise<z.infer<T>> {
  if (!isAiConfigured()) throw new AiError("The AI tools are not set up on this server yet.");
  try {
    const response = await anthropic().beta.messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort, format: betaZodOutputFormat(schema) },
      // If a safety classifier declines, let the API retry on a suitable model instead of failing outright.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
    });
    if (response.stop_reason === "refusal") throw new AiError("The AI declined to write this one. Try different topics or wording.");
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new AiError("The AI's answer was incomplete. Please try again.");
    return response.parsed_output as z.infer<T>;
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (error instanceof Anthropic.RateLimitError) throw new AiError("The AI service is busy. Please try again in a minute.");
    if (error instanceof Anthropic.AuthenticationError) throw new AiError("The AI tools are not set up correctly on this server.");
    if (error instanceof Anthropic.APIError) throw new AiError("The AI service had a problem. Please try again.");
    throw new AiError("The AI service could not be reached. Please try again.");
  }
}

export type LevelInput = {
  title: string;
  topic: string;
  reference: string;
  scriptureText: string | null;
  standard: { reflection: RichDoc; discussion_question: RichDoc; practical_application: RichDoc; prayer: RichDoc };
};

/** Rewrites a devotional's reflection, question, practical step and prayer for one age band. */
export async function relevelDevotional(input: LevelInput, band: GradeBand): Promise<Required<LevelVersion>> {
  const plain = (d: RichDoc) => richTextToPlain(d).trim() || "(none)";
  const result = await ask(Devotional, [
    `Rewrite today's devotional for ${BAND_LONG[band].toLowerCase()}.`,
    `Keep the same Scripture passage, theme and main idea. Write it fresh for this age; do not just shorten the original.`,
    `Age guidance: ${BAND_GUIDE[band]}`,
    "",
    `<devotional>`,
    `Title: ${input.title}`,
    `Topic: ${input.topic}`,
    `Scripture: ${input.reference}`,
    input.scriptureText ? `Passage text (for your understanding only; do not quote it at length):\n${input.scriptureText}` : "",
    `Reflection:\n${plain(input.standard.reflection)}`,
    `Discussion question: ${plain(input.standard.discussion_question)}`,
    `Practical step: ${plain(input.standard.practical_application)}`,
    `Prayer: ${plain(input.standard.prayer)}`,
    `</devotional>`,
  ].join("\n"));
  return toVersion(result);
}

export type NewDevotionalDraft = Required<LevelVersion> & { title: string; topic: string; reference: string };

/** Writes a new devotional about the chosen topics, for one age band. The caller looks up the passage text. */
export async function writeDevotional(topics: string[], band: GradeBand, avoidReferences: string[] = []): Promise<NewDevotionalDraft> {
  const result = await ask(NewDevotional, [
    `Write a new classroom devotional for ${BAND_LONG[band].toLowerCase()} about: ${topics.join(", ")}.`,
    `Choose one Bible passage that genuinely speaks to these topics, at most 12 verses, and build the devotional on it.`,
    VARIETY,
    usedLine(avoidReferences),
    `Open the reflection with ${pickAngle()}.`,
    `Age guidance: ${BAND_GUIDE[band]}`,
  ].filter(Boolean).join("\n"));
  return {
    ...toVersion(result),
    title: result.title.trim().slice(0, 140),
    topic: result.topic.trim().slice(0, 140),
    reference: result.scripture_reference.trim(),
  };
}

export type AiQuota = { remaining: number; limit: number };

// ---------------------------------------------------------------------------------------------
// A whole week for a weekly theme (editors): a plan for the days, then each day at every level.
// ---------------------------------------------------------------------------------------------

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DayPlan = z.object({
  title: z.string().describe("A short title, at most 70 characters."),
  topic: z.string().describe("One line naming what this day is about, at most 100 characters."),
  scripture_reference: z.string().describe("One passage, Book chapter:verse-verse, at most 12 verses, e.g. Philippians 4:6-7."),
});
export type WeekDayPlan = { title: string; topic: string; reference: string };

export type WeekTheme = { title: string; summary: string; category: string | null };
/** Days already written, so the plan builds around them. */
export type ExistingDay = { day: Weekday; title: string; reference: string };

/** Plans the days of a week that are still empty: a title, a focus and one passage each, building one arc. */
export async function planWeek(theme: WeekTheme, days: Weekday[], existing: ExistingDay[], avoidReferences: string[] = []): Promise<Partial<Record<Weekday, WeekDayPlan>>> {
  const schema = z.object(Object.fromEntries(days.map((d) => [d, DayPlan])) as Record<Weekday, typeof DayPlan>);
  const result = (await ask(schema, [
    `Plan a school week of classroom devotionals on the weekly theme "${theme.title}".`,
    theme.summary ? `The theme in a sentence: ${theme.summary}` : "",
    theme.category ? `Category: ${theme.category}.` : "",
    `Plan these days: ${days.join(", ")}. The five days, Monday to Friday, should build one arc: each day a distinct angle on the theme, Friday drawing it together.`,
    existing.length ? `Already written (keep to these, do not repeat their passages): ${existing.map((e) => `${e.day}: "${e.title}" (${e.reference})`).join("; ")}.` : "",
    `Give each day a different Bible passage that genuinely speaks to its focus, at most 12 verses. Mix Old and New Testament where it fits.`,
    VARIETY,
    usedLine(avoidReferences),
  ].filter(Boolean).join("\n"), { model: WEEK_MODEL, effort: "medium" })) as Record<Weekday, z.infer<typeof DayPlan>>;
  const out: Partial<Record<Weekday, WeekDayPlan>> = {};
  for (const d of days) {
    const p = result[d];
    if (p) out[d] = { title: p.title.trim().slice(0, 140), topic: p.topic.trim().slice(0, 140), reference: p.scripture_reference.trim() };
  }
  return out;
}

const AllLevels = z.object({
  standard: Devotional.describe("The standard text, written for grades 6 to 8."),
  k2: Devotional.describe("The same devotional for kindergarten to grade 2."),
  g35: Devotional.describe("The same devotional for grades 3 to 5."),
  g912: Devotional.describe("The same devotional for grades 9 to 12."),
});

export type WrittenDay = { standard: Required<LevelVersion>; levels: Record<"k2" | "g35" | "g912", Required<LevelVersion>> };

/** Writes one planned day: the standard text (grades 6 to 8) and its K-2, 3-5 and 9-12 versions, on the same passage. */
export async function writeWeekDay(theme: WeekTheme, day: Weekday, plan: WeekDayPlan, scriptureText: string, week: string[]): Promise<WrittenDay> {
  const result = await ask(AllLevels, [
    `Write the ${day} devotional of a school week on the theme "${theme.title}".`,
    theme.summary ? `The theme in a sentence: ${theme.summary}` : "",
    `This week: ${week.join("; ")}.`,
    `Today: "${plan.title}". Focus: ${plan.topic}. Passage: ${plan.reference}.`,
    `The passage (for your understanding; do not quote it at length):\n${scriptureText}`,
    `Open the reflection with ${pickAngle()}, so the five days of the week do not all begin the same way.`,
    `Write four versions of the same devotional, on the same passage and idea, each fully written for its age:`,
    `standard: ${BAND_GUIDE.g68}`,
    `k2: ${BAND_GUIDE.k2}`,
    `g35: ${BAND_GUIDE.g35}`,
    `g912: ${BAND_GUIDE.g912}`,
  ].filter(Boolean).join("\n"), { model: WEEK_MODEL, effort: "medium" });
  return { standard: toVersion(result.standard), levels: { k2: toVersion(result.k2), g35: toVersion(result.g35), g912: toVersion(result.g912) } };
}
