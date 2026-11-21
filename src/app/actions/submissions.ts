"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess, requirePlatformRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
