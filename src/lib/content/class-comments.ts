/**
 * The class comment board: what students say, typed by the teacher, shown on
 * the slide. A comment can end with a spoken-style command, e.g.
 *   "I think this taught me to wait for my friends, post comment with smiley emoji"
 * which posts "I think this taught me to wait for my friends" with 😊. The same
 * parser will serve a microphone later; nothing here records audio.
 */
export const COMMENT_EMOJIS = [
  { emoji: "😊", label: "Smiley", words: ["smiley", "smile", "smiling", "happy", "smiley face"] },
  { emoji: "🙏", label: "Praying hands", words: ["praying hands", "prayer", "pray", "praying", "hands together"] },
  { emoji: "❤️", label: "Heart", words: ["heart", "love", "red heart"] },
  { emoji: "💡", label: "Light bulb", words: ["light bulb", "lightbulb", "idea", "bulb"] },
  { emoji: "🙌", label: "Raised hands", words: ["raised hands", "hands up", "celebrate", "hooray", "yay"] },
  { emoji: "⭐", label: "Star", words: ["star", "gold star"] },
  { emoji: "👍", label: "Thumbs up", words: ["thumbs up", "thumb up", "thumbs"] },
] as const;

export const MAX_COMMENT = 160;

export type ParsedComment = { text: string; emoji: string | null; post: boolean };

const COMMAND = /[,.;:!\s-]*\bpost(?:\s+(?:the|my|this))?(?:\s+comment)?(?:\s+with(?:\s+(?:a|an|the))?\s+([a-z ]+?))?(?:\s+(?:emoji|emojis|face))?[.!]*\s*$/i;

/** Splits a trailing "post comment (with … emoji)" command off the text. */
export function parseCommentCommand(input: string): ParsedComment {
  const text = input.replace(/\s+/g, " ").trim();
  const m = COMMAND.exec(text);
  if (!m) return { text, emoji: null, post: false };
  const body = text.slice(0, m.index).trim();
  const wanted = (m[1] ?? "").trim().toLowerCase().replace(/\s+emoji$/, "");
  const match = wanted ? COMMENT_EMOJIS.find((e) => (e.words as readonly string[]).includes(wanted)) : undefined;
  return { text: body, emoji: match?.emoji ?? null, post: true };
}
