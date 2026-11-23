import { z } from "zod";
import { uuidSchema } from "@/lib/auth/schemas";
import { isMonday, isValidIsoDate } from "./dates";
import {
  AUDIENCE_VALUES, CATEGORY_SLUGS, EDUCATIONAL_CATEGORY_CHOICE_VALUES, GRADE_BAND_VALUES,
} from "./options";
import { BANDS, LEVEL_FIELDS, type Levels } from "./levels";
import { isRichDocEmpty, parseRichDoc, type RichDoc } from "./richtext";
import { parseReference } from "./scripture";

const blankToNull = <T extends [string, ...string[]]>(values: T) =>
  z.union([z.literal(""), z.enum(values)]).transform((v) => (v === "" ? null : v));

const richField = z.string().transform((value, ctx): RichDoc => {
  const doc = parseRichDoc(value);
  if (!doc) {
    ctx.addIssue({ code: "custom", message: "This text contains formatting that is not allowed, or is too long." });
    return z.NEVER;
  }
  return doc;
});

/** A rich-text field that may be left out entirely (an unopened reading-level tab). */
const optionalRich = z.string().optional().transform((value, ctx): RichDoc | null => {
  if (value === undefined || value.trim() === "") return null;
  const doc = parseRichDoc(value);
  if (!doc) {
    ctx.addIssue({ code: "custom", message: "This text contains formatting that is not allowed, or is too long." });
    return z.NEVER;
  }
  return isRichDocEmpty(doc) ? null : doc;
});

/** Form field name for one band's version of one field, e.g. "level_k2_reflection". */
export const levelFieldName = (band: string, field: string) => `level_${band}_${field}`;

const levelShape = Object.fromEntries(
  BANDS.flatMap((band) => LEVEL_FIELDS.map((field) => [levelFieldName(band, field), optionalRich])),
) as Record<string, typeof optionalRich>;

const optionalText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} must be ${max} characters or fewer.`);

const scriptureReference = z
  .string()
  .trim()
  .max(120)
  .transform((value, ctx) => {
    if (value === "") return "";
    const parsed = parseReference(value);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.error });
      return z.NEVER;
    }
    return parsed.normalized;
  });

/**
 * A devotional as saved from the editor. Only the date is required so work in
 * progress can be saved; completeness is enforced when moving to review.
 */
export const devotionalSchema = z
  .object({
    id: z.union([z.literal(""), uuidSchema]).optional(),
    title: optionalText(140, "The title"),
    devotionalDate: z.string().refine(isValidIsoDate, "Choose a valid date."),
    themeId: z.union([z.literal(""), uuidSchema]).transform((v) => (v === "" ? null : v)),
    dailyTopic: optionalText(140, "The daily topic"),
    categorySlug: blankToNull(CATEGORY_SLUGS),
    scriptureReference,
    translationCode: z.union([z.literal(""), z.string().regex(/^[a-z0-9]{2,10}$/)]).transform((v) => (v === "" ? null : v)),
    // A disabled field is not submitted at all, so a missing value means "no text".
    scriptureText: z
      .string()
      .max(6000, "Scripture text must be 6,000 characters or fewer.")
      .default("")
      .transform((v) => v.replace(/\r\n?/g, "\n").trim())
      .transform((v) => (v === "" ? null : v)),
    reflection: richField,
    prayer: richField,
    discussionQuestion: richField,
    practicalApplication: richField,
    audience: blankToNull(AUDIENCE_VALUES),
    accessLevel: z.enum(["free", "plus"]).default("free"),
    gradeLevels: z.array(z.enum(GRADE_BAND_VALUES)).max(4),
    educationalCategory: blankToNull(EDUCATIONAL_CATEGORY_CHOICE_VALUES),
    authorName: optionalText(120, "The author name"),
    ...levelShape,
  })
  .superRefine((value, ctx) => {
    if (value.scriptureText && !value.translationCode) {
      ctx.addIssue({ code: "custom", path: ["translationCode"], message: "Choose the translation this text comes from." });
    }
  })
  .transform((value) => {
    const levels: Levels = {};
    const record = value as Record<string, unknown>;
    for (const band of BANDS) {
      for (const field of LEVEL_FIELDS) {
        const doc = record[levelFieldName(band, field)] as RichDoc | null;
        if (doc) (levels[band] ??= {})[field] = doc;
      }
    }
    return { ...value, levels };
  });
export type DevotionalInput = z.output<typeof devotionalSchema>;

export const themeSchema = z.object({
  title: z.string().trim().min(1, "Enter a theme title.").max(140, "The title must be 140 characters or fewer."),
  summary: z.string().trim().max(1000, "The summary must be 1,000 characters or fewer."),
  weekStart: z.string().refine(isMonday, "Choose a Monday. A weekly theme covers Monday to Friday."),
  categorySlug: blankToNull(CATEGORY_SLUGS),
});

export const transitionSchema = z.object({
  id: uuidSchema,
  to: z.enum(["draft", "in_review", "approved", "scheduled", "published", "archived"]),
  publishLocal: z.string().optional(),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export const translationSchema = z
  .object({
    code: z.string().trim().toLowerCase().regex(/^[a-z0-9]{2,10}$/, "Use 2 to 10 lowercase letters or digits."),
    name: z.string().trim().min(1, "Enter the translation's name.").max(120),
    licenseType: z.enum(["public_domain", "licensed", "reference_only"]),
    textAllowed: z.boolean(),
    attribution: z.string().trim().max(600, "Keep the attribution under 600 characters."),
    licenseNotes: z.string().trim().max(2000, "Keep the notes under 2,000 characters."),
  })
  .superRefine((v, ctx) => {
    if (v.licenseType === "reference_only" && v.textAllowed) {
      ctx.addIssue({ code: "custom", path: ["textAllowed"], message: "A reference-only translation cannot display text. Choose another licence type first." });
    }
    if (v.licenseType === "licensed" && v.textAllowed && v.attribution === "") {
      ctx.addIssue({ code: "custom", path: ["attribution"], message: "Licensed text must carry the attribution your licence requires." });
    }
  });
