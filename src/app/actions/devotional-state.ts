"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * A teacher's private bookmarks, completion and notes. The signed-in user is
 * taken from the session, never from the request, and the database policies
 * independently restrict every row to its owner.
 */

type Result = { ok: true } | { ok: false; error: string };

const FAILED_TEXT = "That could not be saved. Please try again.";
const FAILED: Result = { ok: false, error: FAILED_TEXT };

async function upsert(devotionalId: string, columns: Record<string, unknown>): Promise<Result> {
  const id = uuidSchema.safeParse(devotionalId);
  if (!id.success) return FAILED;
  const { user } = await requireAccess();
  const supabase = await createClient();
  const { error } = await supabase
    .from("devotional_user_state")
    .upsert({ user_id: user.id, devotional_id: id.data, ...columns }, { onConflict: "user_id,devotional_id" });
  if (error) {
    // The database states the limit in plain words; show it so the person knows what to do.
    if (error.code === "P0402") return { ok: false, error: error.message };
    return FAILED;
  }
  revalidatePath("/today");
  revalidatePath("/archive");
  return { ok: true };
}

export async function setBookmarkAction(devotionalId: string, bookmarked: boolean): Promise<Result> {
  if (typeof bookmarked !== "boolean") return FAILED;
  return upsert(devotionalId, { bookmarked });
}

export async function setCompletedAction(devotionalId: string, completed: boolean): Promise<Result> {
  if (typeof completed !== "boolean") return FAILED;
  return upsert(devotionalId, { completed_at: completed ? new Date().toISOString() : null });
}

const noteSchema = z.string().max(5000, "Notes can be up to 5,000 characters.");

export async function saveNoteAction(devotionalId: string, note: string): Promise<Result> {
  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? FAILED_TEXT };
  return upsert(devotionalId, { note: parsed.data });
}
