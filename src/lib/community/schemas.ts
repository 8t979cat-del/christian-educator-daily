import { z } from "zod";
import { CONTRIBUTION_KINDS, GROUP_CATEGORIES } from "./covenant";

const uuid = z.uuid();
const trimmed = (max: number, message: string) => z.string().trim().max(max, message);
const optionalText = (max: number, message: string) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), trimmed(max, message).optional());

export const contributionSchema = z
  .object({
    devotionalId: uuid,
    kind: z.enum(CONTRIBUTION_KINDS as [string, ...string[]]),
    title: optionalText(120, "A title can be up to 120 characters."),
    body: z.string().trim().min(1, "Write something first.").max(4000, "Please keep this under 4,000 characters."),
    visibility: z.enum(["named", "anonymous", "private"]).default("named"),
    reminderAcknowledged: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "prayer") {
      if (value.title) ctx.addIssue({ code: "custom", path: ["title"], message: "Only prayers have a title." });
      if (value.visibility !== "named") ctx.addIssue({ code: "custom", path: ["visibility"], message: "Only prayers can be anonymous or private." });
    }
    // The reminder must be acknowledged before a prayer other people can read is shared.
    if (value.kind === "prayer" && value.visibility !== "private" && !value.reminderAcknowledged) {
      ctx.addIssue({ code: "custom", path: ["reminderAcknowledged"], message: "Please confirm you have read the reminder." });
    }
  });

export const contributionEditSchema = z.object({
  id: uuid,
  devotionalId: uuid,
  title: optionalText(120, "A title can be up to 120 characters."),
  body: z.string().trim().min(1, "Write something first.").max(4000, "Please keep this under 4,000 characters."),
  visibility: z.enum(["named", "anonymous", "private"]).optional(),
});

export const replySchema = z.object({
  contributionId: uuid,
  devotionalId: uuid,
  body: z.string().trim().min(1, "Write something first.").max(2000, "Please keep replies under 2,000 characters."),
});

export const reportSchema = z.object({
  targetType: z.enum(["contribution", "reply", "group_post", "group_comment"]),
  targetId: uuid,
  reason: z.enum(["harassment", "threat_or_hate", "spam_or_solicitation", "student_privacy", "personal_information", "inappropriate", "other"]),
  details: optionalText(1000, "Please keep details under 1,000 characters."),
  urgent: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
  returnTo: z.string().max(300).optional(),
});

const category = z.enum(GROUP_CATEGORIES.map((c) => c.value) as [string, ...string[]]);

export const groupSchema = z.object({
  name: z.string().trim().min(2, "Give the group a name of at least 2 characters.").max(80, "Keep the name under 80 characters."),
  description: trimmed(500, "Keep the description under 500 characters.").default(""),
  purpose: trimmed(500, "Keep the purpose under 500 characters.").default(""),
  guidelines: trimmed(3000, "Keep the guidelines under 3,000 characters.").default(""),
  category,
  privacy: z.enum(["private", "discoverable"]),
  schoolId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
});

export const groupPostSchema = z.object({
  groupId: uuid,
  kind: z.enum(["post", "prayer", "question"]),
  title: optionalText(120, "A title can be up to 120 characters."),
  body: z.string().trim().min(1, "Write something first.").max(5000, "Please keep posts under 5,000 characters."),
  scriptureReference: optionalText(120, "Keep the reference under 120 characters."),
  devotionalId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
});

export const groupCommentSchema = z.object({
  groupId: uuid,
  postId: uuid,
  parentId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  body: z.string().trim().min(1, "Write something first.").max(3000, "Please keep comments under 3,000 characters."),
});

export const groupInviteSchema = z.object({
  groupId: uuid,
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address.")),
  role: z.enum(["member", "moderator"]).default("member"),
});

export const requiredReason = (label = "reason") => z.string().trim().min(1, `Please give a ${label}.`).max(1000, "Please keep this under 1,000 characters.");
