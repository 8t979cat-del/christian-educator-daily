"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requirePlatformRole } from "@/lib/auth/session";
import { RESOURCE_KINDS, textToDoc } from "@/lib/billing/resource-text";
import { createClient } from "@/lib/supabase/server";

const EDITORS = ["platform_admin", "content_editor"] as const;
const kinds = RESOURCE_KINDS.map((k) => k.value) as [string, ...string[]];

export async function createResourceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole([...EDITORS]);
  const parsed = parseForm(
    z.object({
      kind: z.enum(kinds),
      title: z.string().trim().min(1, "Give it a title.").max(200),
      summary: z.string().trim().max(600, "Keep the summary under 600 characters.").default(""),
      body: z.string().trim().min(1, "Add the text.").max(12000, "That is longer than the editor allows."),
      weekOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      status: z.enum(["draft", "published"]).default("draft"),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const body = textToDoc(d.body);
  if (!body) return errorState("The text could not be read.", { values: parsed.echo });
  const feature = RESOURCE_KINDS.find((k) => k.value === d.kind)!.feature;
  const supabase = await createClient();
  const { error } = await supabase.from("resources").insert({
    kind: d.kind, title: d.title, summary: d.summary, body, required_feature: feature, status: d.status, week_of: d.weekOf || null,
  });
  if (error) return errorState("The resource could not be saved.", { values: parsed.echo });
  revalidatePath("/admin/resources");
  revalidatePath("/resources");
  return successState(d.status === "published" ? "Published." : "Saved as a draft.");
}

export async function setResourceStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole([...EDITORS]);
  const parsed = parseForm(z.object({ id: z.uuid(), status: z.enum(["draft", "published", "archived"]) }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.from("resources").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  if (error) return errorState("That could not be changed.");
  revalidatePath("/admin/resources");
  revalidatePath("/resources");
  return successState("Updated.");
}
