/**
 * A first, honest line of defence against disclosing private information in public.
 * This is a HEURISTIC. It catches careless disclosure (an email, a phone number, a link,
 * "my student Jamie"). It cannot recognise every identifying detail and does not pretend to.
 * Reporting, moderation and the covenant do the rest.
 */

export type Screening = { ok: true } | { ok: false; reason: string };

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// Seven or more digits, allowing the usual separators.
const PHONE = /(?:\+?\d[\s().-]?){7,}/;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|org|net|edu|io|co|info|ly|me)\b\/?\S*/i;

const NOT_NAMES = new Set([
  "council", "body", "government", "ministry", "life", "union", "leader", "leaders", "athlete", "athletes",
  "teacher", "teachers", "who", "that", "which", "in", "at", "from", "with", "and", "or", "but", "the", "this", "these",
  "those", "of", "to", "has", "had", "was", "is", "are", "will", "would", "can", "could", "did", "does", "so", "i",
]);

// "my student Jamie", "a fourth-grade student named Maria", "our child Sam Lopez", "one of my pupils, Ahmed"
const STUDENT_NAME =
  /\b(?:my|our|a|the|one of my|one of our)\s+(?:[\w-]+\s+){0,3}?(?:student|pupil|child|kid|son|daughter|boy|girl)s?(?:\s+named|\s+called|,)?\s+([A-Za-z][a-z]+)\b/gi;

function mentionsNamedStudent(text: string): boolean {
  for (const match of text.matchAll(STUDENT_NAME)) {
    const name = match[1] ?? "";
    // Must be capitalised in the original text, and not an ordinary word.
    if (/^[A-Z]/.test(name) && !NOT_NAMES.has(name.toLowerCase())) return true;
  }
  return false;
}

/** Public discussion and prayers: no contact details, no links, no named students. */
export function screenPublicText(text: string): Screening {
  if (EMAIL.test(text)) {
    return { ok: false, reason: "Please remove the email address. Public discussion should not include contact details." };
  }
  if (PHONE.test(text)) {
    return { ok: false, reason: "Please remove the phone number. Public discussion should not include contact details." };
  }
  if (URL_LIKE.test(text)) {
    return { ok: false, reason: "Links are not allowed in public discussion. Describe the resource and its title instead." };
  }
  if (mentionsNamedStudent(text)) {
    return {
      ok: false,
      reason: "This seems to name a student. Please describe the situation without a name, or anything else that could identify them.",
    };
  }
  return { ok: true };
}

/** Private groups are more open, but student names are still not shared there. */
export function screenGroupText(text: string): Screening {
  if (mentionsNamedStudent(text)) {
    return {
      ok: false,
      reason: "This seems to name a student. Our covenant asks us to describe situations without identifying students.",
    };
  }
  return { ok: true };
}
