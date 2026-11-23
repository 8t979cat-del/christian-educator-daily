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
  // Update the person's row if it exists, otherwise create it. Not an upsert: an upsert asks to update
  // user_id and devotional_id as well, which the database (rightly) never lets a person change, so it
  // was refused every time.
  const table = () => supabase.from("devotional_user_state");
  const update = () => table().update(columns).eq("user_id", user.id).eq("devotional_id", id.data).select("devotional_id");
  let { data, error } = await update();
  if (!error && (data ?? []).length === 0) {
    ({ error } = await table().insert({ user_id: user.id, devotional_id: id.data, ...columns }));
    // Saved at the same moment in another tab: the row now exists, so update it.
    if (error?.code === "23505") ({ error } = await update());
  }
  if (error) {
    console.error("devotional state:", error.code, error.message);
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
