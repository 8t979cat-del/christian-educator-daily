"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { grantRoleSchema, uuidSchema } from "@/lib/auth/schemas";
import { requirePlatformRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Granting and revoking staff roles. Only platform administrators; the database function re-checks. */

export async function grantPlatformRoleAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(grantRoleSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_platform_role", {
    target_email: parsed.data.email,
    new_role: parsed.data.role,
  });
  if (error) {
    return errorState(
      error.code === "P0002"
        ? "No account exists with that email address. They need to sign up first."
        : "That role could not be granted.",
      { values: parsed.echo },
    );
  }
  revalidatePath("/admin");
  return successState(`Granted ${parsed.data.role.replace("_", " ")} to ${parsed.data.email}.`);
}

export async function revokePlatformRoleAction(formData: FormData): Promise<void> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = z
    .object({ userId: uuidSchema, role: z.enum(["platform_admin", "content_editor", "moderator"]) })
    .safeParse({ userId: formData.get("userId"), role: formData.get("role") });
  if (!parsed.success) redirect("/admin?notice=failed");

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_platform_role", {
    target_user: parsed.data.userId,
    old_role: parsed.data.role,
  });
  if (error?.message.includes("last platform admin")) redirect("/admin?notice=last_admin");
  redirect(error ? "/admin?notice=failed" : "/admin?notice=role_revoked");
}
