"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requireAccess } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { communityError } from "@/lib/community/errors";

/*
 * Shared school tools. The database requires an active license AND an administrator role for every
 * write (and a license plus membership for every read), so these actions only shape messages.
 */

const uuid = z.uuid();
const path = (schoolId: string) => `/school/${schoolId}/tools`;
const fail = (error: { code?: string; message?: string } | null) =>
  errorState(communityError(error as never, "That could not be saved. Please try again."));

export async function createAssignmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({
      schoolId: uuid, devotionalId: uuid,
      note: z.string().trim().max(500, "Keep the note under 500 characters.").default(""),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("school_assignments").insert({
    school_id: d.schoolId, devotional_id: d.devotionalId, note: d.note, due_date: d.dueDate || null,
  });
  if (error) return error.code === "42501" ? errorState("Assignments are part of the School License, and are set up by a school administrator.") : fail(error);
  revalidatePath(path(d.schoolId));
  return successState("Devotional assigned to the faculty.");
}

export async function deleteAssignmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ schoolId: uuid, id: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("school_assignments").delete().eq("id", parsed.data.id).eq("school_id", parsed.data.schoolId);
  if (error) return fail(error);
  revalidatePath(path(parsed.data.schoolId));
  return successState("Assignment removed.");
}

export async function createSchoolCollectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({
      schoolId: uuid,
      name: z.string().trim().min(1, "Give the collection a name.").max(80, "Keep the name under 80 characters."),
      description: z.string().trim().max(500).default(""),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("school_collections").insert({
    school_id: parsed.data.schoolId, name: parsed.data.name, description: parsed.data.description,
  });
  if (error) return error.code === "42501" ? errorState("Shared collections are part of the School License, and are set up by a school administrator.") : fail(error);
  revalidatePath(path(parsed.data.schoolId));
  return successState("Collection created.");
}

export async function addToSchoolCollectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ schoolId: uuid, collectionId: uuid, devotionalId: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("school_collection_items").insert({ collection_id: parsed.data.collectionId, devotional_id: parsed.data.devotionalId });
  if (error) return error.code === "23505" ? errorState("That devotional is already in the collection.") : fail(error);
  revalidatePath(path(parsed.data.schoolId));
  return successState("Added to the collection.");
}

export async function deleteSchoolCollectionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ schoolId: uuid, id: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("school_collections").delete().eq("id", parsed.data.id).eq("school_id", parsed.data.schoolId);
  if (error) return fail(error);
  revalidatePath(path(parsed.data.schoolId));
  return successState("Collection removed.");
}
