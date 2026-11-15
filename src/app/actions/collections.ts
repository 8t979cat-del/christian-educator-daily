"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/*
 * A teacher's own saved collections. Creating and filling them is an Educator Plus feature, enforced
 * by the database; reading and deleting what already exists is never locked, so a lapsed plan loses nothing.
 */

const UPGRADE = "Saved collections are part of Educator Plus. Your existing collections stay yours.";

export async function createCollectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ name: z.string().trim().min(1, "Give the collection a name.").max(80, "Keep the name under 80 characters.") }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("user_collections").insert({ name: parsed.data.name });
  if (error) return errorState(error.code === "42501" ? UPGRADE : "That could not be saved. Please try again.");
  revalidatePath("/library");
  return successState("Collection created.");
}

export async function deleteCollectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ id: uuidSchema }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("user_collections").delete().eq("id", parsed.data.id);
  if (error) return errorState("That could not be removed.");
  revalidatePath("/library");
  return successState("Collection removed.");
}

export async function removeFromCollectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ collectionId: uuidSchema, devotionalId: uuidSchema }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("user_collection_items").delete().eq("collection_id", parsed.data.collectionId).eq("devotional_id", parsed.data.devotionalId);
  if (error) return errorState("That could not be removed.");
  revalidatePath("/library");
  return successState("Removed.");
}

/** Called from the devotional page's small "Add to collection" control. */
export async function addToCollectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ collectionId: uuidSchema, devotionalId: uuidSchema }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("user_collection_items").insert({ collection_id: parsed.data.collectionId, devotional_id: parsed.data.devotionalId });
  if (error) return errorState(error.code === "23505" ? "Already in that collection." : error.code === "42501" ? UPGRADE : "That could not be saved.");
  revalidatePath("/library");
  return successState("Added.");
}
