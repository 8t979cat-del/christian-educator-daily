"use server";

import { z } from "zod";
import { AiError, isAiConfigured, relevelDevotional, writeDevotional } from "@/lib/ai/devotional-ai";
import { requireAccess } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/auth/schemas";
import { KJV, kjvPassage } from "@/lib/bible/kjv";
import { BANDS, LEVEL_FIELDS, type LevelVersion } from "@/lib/content/levels";
import { getDevotional, getTranslation } from "@/lib/content/queries";
import { sanitizeRichDoc } from "@/lib/content/richtext";
import { scriptureDisplay } from "@/lib/content/scripture";
import { createClient } from "@/lib/supabase/server";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const band = z.enum(BANDS);
const fail = (error: string) => ({ ok: false as const, error });

/** Spends one of today's AI requests. Refused without the plan feature or over the daily limit. */
async function consume(): Promise<string | null> {
  if (!isAiConfigured()) return "The AI tools are not set up on this server yet.";
  const { error } = await (await createClient()).rpc("ai_consume");
  if (!error) return null;
  return error.code === "P0001" ? error.message : "The AI tools could not be started. Please try again.";
}

/** A teacher's text, checked: only the four fields, each a valid rich-text document. */
function cleanVersion(raw: unknown): Required<LevelVersion> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const out: Partial<Required<LevelVersion>> = {};
  for (const f of LEVEL_FIELDS) {
    const doc = sanitizeRichDoc((raw as Record<string, unknown>)[f]);
    if (!doc) return null;
    out[f] = doc;
  }
  return out as Required<LevelVersion>;
}

/** Re-levels a published devotional for one age band. Returns a draft; nothing is saved. */
export async function relevelAction(input: { devotionalId: string; band: string }): Promise<Result<{ version: Required<LevelVersion> }>> {
  await requireAccess();
  const parsed = z.object({ devotionalId: uuidSchema, band }).safeParse(input);
  if (!parsed.success) return fail("Choose a reading level.");
  const d = await getDevotional(parsed.data.devotionalId);
  if (!d) return fail("That devotional is not available.");
  const refused = await consume();
  if (refused) return fail(refused);
  const display = scriptureDisplay(d.scripture_text, await getTranslation(d.translation_code));
  try {
    const version = await relevelDevotional({
      title: d.title,
      topic: d.daily_topic,
      reference: d.scripture_reference,
      scriptureText: display.mode === "text" ? display.text : null,
      standard: { reflection: d.reflection, discussion_question: d.discussion_question, practical_application: d.practical_application, prayer: d.prayer },
    }, parsed.data.band);
    return { ok: true, version };
  } catch (error) {
    return fail(error instanceof AiError ? error.message : "The AI service could not be reached. Please try again.");
  }
}

/** Saves the teacher's own version of a devotional for a reading level (null: the standard text). */
export async function saveVersionAction(input: { devotionalId: string; band: string | null; version: unknown; source: "edited" | "ai_leveled" }): Promise<Result<object>> {
  await requireAccess();
  const parsed = z.object({ devotionalId: uuidSchema, band: band.nullable(), source: z.enum(["edited", "ai_leveled"]) }).safeParse(input);
  const version = cleanVersion(input.version);
  if (!parsed.success || !version) return fail("This version could not be saved. Check the text and try again.");
  const supabase = await createClient();
  const { devotionalId, band: b, source } = parsed.data;
  let existing = supabase.from("presentation_versions").select("id").eq("devotional_id", devotionalId);
  existing = b === null ? existing.is("band", null) : existing.eq("band", b);
  const { data: found } = await existing.maybeSingle();
  const row = { devotional_id: devotionalId, band: b, source, content: version };
  const { error } = found
    ? await supabase.from("presentation_versions").update({ source, content: version }).eq("id", found.id as string)
    : await supabase.from("presentation_versions").insert(row);
  if (error) {
    return fail(error.code === "42501" || /row-level security/.test(error.message)
      ? "Saving your own versions is part of Educator Plus and school licences."
      : "This version could not be saved. Please try again.");
  }
  return { ok: true };
}

/** Deletes the teacher's saved version, so the published text is used again. */
export async function deleteVersionAction(input: { devotionalId: string; band: string | null }): Promise<Result<object>> {
  await requireAccess();
  const parsed = z.object({ devotionalId: uuidSchema, band: band.nullable() }).safeParse(input);
  if (!parsed.success) return fail("Nothing to remove.");
  const supabase = await createClient();
  let del = supabase.from("presentation_versions").delete().eq("devotional_id", parsed.data.devotionalId);
  del = parsed.data.band === null ? del.is("band", null) : del.eq("band", parsed.data.band);
  const { error } = await del;
  return error ? fail("Your version could not be removed. Please try again.") : { ok: true };
}

export type GeneratedDraft = {
  title: string;
  topic: string;
  reference: string;
  scriptureText: string;
  notice: string;
  translationLabel: string;
  version: Required<LevelVersion>;
};

/**
 * Writes a new devotional about the chosen topics. The AI chooses the passage; its text
 * comes from the bundled KJV. If the AI names a passage that is not valid or too long,
 * it is asked once more for a different one.
 */
export async function writeDevotionalAction(input: { topics: string[]; band: string }): Promise<Result<{ draft: GeneratedDraft }>> {
  await requireAccess();
  const parsed = z.object({ topics: z.array(z.string().trim().min(2).max(40)).min(1).max(6), band }).safeParse(input);
  if (!parsed.success) return fail("Choose between one and six topics.");
  const refused = await consume();
  if (refused) return fail(refused);
  try {
    const tried: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const draft = await writeDevotional(parsed.data.topics, parsed.data.band, tried);
      const passage = kjvPassage(draft.reference);
      if (passage) {
        const { reference, title, topic, ...version } = draft;
        return {
          ok: true,
          draft: { title, topic, reference: passage.reference, scriptureText: passage.text, notice: KJV.notice, translationLabel: KJV.label, version },
        };
      }
      tried.push(draft.reference);
    }
    return fail("The AI chose a passage that could not be found. Please try again.");
  } catch (error) {
    return fail(error instanceof AiError ? error.message : "The AI service could not be reached. Please try again.");
  }
}

/** Saves a generated devotional (after the teacher's review and edits) to the teacher's own list. */
export async function saveGeneratedAction(input: { title: string; topic: string; reference: string; topics: string[]; version: unknown }): Promise<Result<{ id: string }>> {
  await requireAccess();
  const parsed = z.object({
    title: z.string().trim().min(1).max(140),
    topic: z.string().trim().max(140),
    reference: z.string().trim().max(120),
    topics: z.array(z.string().trim().max(40)).max(12),
  }).safeParse(input);
  const version = cleanVersion(input.version);
  // The passage must still be one the bundled Bible can show: its text is never taken from the client.
  if (!parsed.success || !version || !kjvPassage(parsed.data.reference)) return fail("This devotional could not be saved. Check the text and try again.");
  const { data, error } = await (await createClient()).from("presentation_versions").insert({
    source: "ai_generated",
    title: parsed.data.title,
    topic: parsed.data.topic,
    topics: parsed.data.topics,
    content: version,
    scripture: { reference: parsed.data.reference, translation_code: KJV.code },
  }).select("id").single();
  if (error || !data) {
    return fail(/row-level security/.test(error?.message ?? "") ? "Saving is part of Educator Plus and school licences." : "This devotional could not be saved. Please try again.");
  }
  return { ok: true, id: data.id as string };
}
