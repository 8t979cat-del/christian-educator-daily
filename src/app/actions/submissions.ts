"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess, requirePlatformRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { BIBLES, BIBLE_CODES, MAX_VERSES, biblePassage } from "@/lib/bible/kjv";
import { textToDoc } from "@/lib/content/editable";

type Result = { ok: true } | { ok: false; error: string };

const message = (error: { code?: string; message: string } | null, fallback: string) =>
  error?.code === "P0001" ? error.message : fallback;

/** Sends one of the teacher's saved devotionals to the editors for publishing. */
export async function submitDevotionalAction(input: { versionId: string; note: string }): Promise<Result> {
  await requireAccess();
  const parsed = z.object({ versionId: uuidSchema, note: z.string().max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Keep the note under 1,000 characters." };
  const { error } = await (await createClient()).rpc("submit_devotional", { p_version: parsed.data.versionId, p_note: parsed.data.note });
  if (error) return { ok: false, error: message(error, "It could not be submitted. Please try again.") };
  revalidatePath("/create");
  return { ok: true };
}

/** Takes back a submission the editors have not reviewed yet. */
export async function withdrawSubmissionAction(id: string): Promise<Result> {
  await requireAccess();
  if (!uuidSchema.safeParse(id).success) return { ok: false, error: "Nothing to withdraw." };
  const { error } = await (await createClient()).rpc("withdraw_submission", { p_id: id });
  if (error) return { ok: false, error: message(error, "It could not be withdrawn. Please try again.") };
  revalidatePath("/create");
  return { ok: true };
}

/** Editors: decline a submission, with a note the teacher will see. */
export async function declineSubmissionAction(input: { id: string; note: string }): Promise<Result> {
  await requirePlatformRole(["content_editor", "platform_admin"]);
  const parsed = z.object({ id: uuidSchema, note: z.string().max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Keep the note under 1,000 characters." };
  const { error } = await (await createClient()).rpc("review_submission", { p_id: parsed.data.id, p_decision: "declined", p_note: parsed.data.note });
  if (error) return { ok: false, error: message(error, "It could not be declined. Please try again.") };
  revalidatePath("/admin/submissions");
  return { ok: true };
}

const doc = z.string().max(4000);

/**
 * Saves a devotional the teacher wrote from a blank page (new, or an edit of their own).
 * Any signed-in user may. The passage text is never stored: it is looked up from the
 * bundled public-domain Bible when presented.
 */
export async function saveWrittenAction(input: {
  id?: string | null;
  title: string;
  topic: string;
  reference: string;
  translation: string;
  text: { reflection: string; discussion_question: string; practical_application: string; prayer: string };
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireAccess();
  const parsed = z.object({
    id: uuidSchema.nullish(),
    title: z.string().trim().min(1, "Give it a title.").max(140),
    topic: z.string().trim().max(140),
    reference: z.string().trim().max(120),
    translation: z.enum(BIBLE_CODES),
    text: z.object({ reflection: doc, discussion_question: doc, practical_application: doc, prayer: doc }),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message === "Give it a title." ? "Give it a title." : "Check the text: each part can be up to 4,000 characters." };
  const d = parsed.data;
  let scripture: { reference: string; translation_code: string } | null = null;
  if (d.reference) {
    const passage = biblePassage(d.translation, d.reference);
    if (!passage) return { ok: false, error: `“${d.reference}” could not be found in the ${BIBLES[d.translation].label}. Use a reference like Galatians 6:9–10, at most ${MAX_VERSES} verses.` };
    scripture = { reference: passage.reference, translation_code: d.translation };
  }
  if (Object.values(d.text).every((t) => !t.trim())) return { ok: false, error: "Write at least one part before saving." };
  const row = {
    source: "written",
    title: d.title,
    topic: d.topic,
    scripture,
    content: {
      reflection: textToDoc(d.text.reflection),
      discussion_question: textToDoc(d.text.discussion_question),
      practical_application: textToDoc(d.text.practical_application),
      prayer: textToDoc(d.text.prayer),
    },
  };
  const supabase = await createClient();
  const { data, error } = d.id
    ? await supabase.from("presentation_versions").update(row).eq("id", d.id).eq("source", "written").select("id").maybeSingle()
    : await supabase.from("presentation_versions").insert(row).select("id").single();
  if (error || !data) return { ok: false, error: "Your devotional could not be saved. Please try again." };
  revalidatePath("/create");
  return { ok: true, id: data.id as string };
}

/** The text of a passage from a bundled public-domain Bible, for the blank-page writer's preview. */
export async function previewPassageAction(input: { reference: string; translation: string }): Promise<{ ok: true; reference: string; text: string } | { ok: false; error: string }> {
  await requireAccess();
  const parsed = z.object({ reference: z.string().trim().min(1).max(120), translation: z.enum(BIBLE_CODES) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a reference, such as Galatians 6:9–10." };
  const passage = biblePassage(parsed.data.translation, parsed.data.reference);
  if (!passage) return { ok: false, error: `“${parsed.data.reference}” could not be found in the ${BIBLES[parsed.data.translation].label}. At most ${MAX_VERSES} verses.` };
  return { ok: true, reference: passage.reference, text: passage.text };
}
