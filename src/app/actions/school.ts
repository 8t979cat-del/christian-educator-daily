"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import {
  canChangeMemberRole,
  canInviteRole,
  canRemoveMember,
  type SchoolRole,
} from "@/lib/auth/roles";
import { createSchoolSchema, inviteSchema, uuidSchema } from "@/lib/auth/schemas";
import { requireAccess, requireSchoolRole } from "@/lib/auth/session";
import { generateInviteToken, hashToken } from "@/lib/auth/tokens";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/*
 * Every action here (1) authenticates, (2) checks the caller's role in code
 * for a friendly error, and (3) performs the write as the signed-in user, so
 * the database's row-level security has the final say.
 */

const done = (code: string) => `/school?notice=${code}`;

export async function createSchoolAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(createSchoolSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_school", { school_name: parsed.data.name });
  if (error) {
    return errorState("We could not create the school. Please try again.", { values: parsed.echo });
  }
  revalidatePath("/", "layout");
  redirect(done("school_created"));
}

export async function createInvitationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(inviteSchema, formData);
  if (!parsed.ok) return parsed.state;

  const { ctx, membership } = await requireSchoolRole(parsed.data.schoolId, ["owner", "admin"]);
  if (!canInviteRole(membership.role, parsed.data.role)) {
    return errorState("Only an owner can invite another administrator.", { values: parsed.echo });
  }
  if (parsed.data.email === ctx.user.email) {
    return errorState("That is your own email address.", { values: parsed.echo });
  }

  const token = generateInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.from("school_invitations").insert({
    school_id: parsed.data.schoolId,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: hashToken(token),
    invited_by: ctx.user.id,
  });
  if (error) return errorState("We could not create the invitation. Please try again.", { values: parsed.echo });

  revalidatePath("/school");
  return successState(
    `Invitation created for ${parsed.data.email}. Email delivery is not built yet, so copy this link and send it to them yourself. It only works for that email address and expires in 14 days.`,
    { output: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/invite/${token}` },
  );
}

const memberTarget = z.object({ schoolId: uuidSchema, userId: uuidSchema });

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const parsed = z.object({ schoolId: uuidSchema, invitationId: uuidSchema }).safeParse({
    schoolId: formData.get("schoolId"),
    invitationId: formData.get("invitationId"),
  });
  if (!parsed.success) redirect(done("failed"));
  await requireSchoolRole(parsed.data.schoolId, ["owner", "admin"]);

  const supabase = await createClient();
  const { error } = await supabase
    .from("school_invitations")
    .delete()
    .eq("id", parsed.data.invitationId)
    .eq("school_id", parsed.data.schoolId);
  redirect(done(error ? "failed" : "invitation_revoked"));
}

async function loadTargetRole(schoolId: string, userId: string): Promise<SchoolRole | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("school_memberships")
    .select("role")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as SchoolRole | undefined) ?? null;
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const parsed = memberTarget.extend({ role: z.enum(["owner", "admin", "faculty", "staff"]) }).safeParse({
    schoolId: formData.get("schoolId"),
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) redirect(done("failed"));

  const { ctx, membership } = await requireSchoolRole(parsed.data.schoolId, ["owner", "admin"]);
  const current = await loadTargetRole(parsed.data.schoolId, parsed.data.userId);
  if (!current || parsed.data.userId === ctx.user.id || !canChangeMemberRole(membership.role, current, parsed.data.role)) {
    redirect(done("not_allowed"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_memberships")
    .update({ role: parsed.data.role })
    .eq("school_id", parsed.data.schoolId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error?.message.includes("at least one owner")) redirect(done("last_owner"));
  redirect(done(error || !data?.length ? "not_allowed" : "member_updated"));
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const parsed = memberTarget.safeParse({ schoolId: formData.get("schoolId"), userId: formData.get("userId") });
  if (!parsed.success) redirect(done("failed"));

  const { ctx, membership } = await requireSchoolRole(parsed.data.schoolId, ["owner", "admin"]);
  const current = await loadTargetRole(parsed.data.schoolId, parsed.data.userId);
  if (!current || parsed.data.userId === ctx.user.id || !canRemoveMember(membership.role, current)) {
    redirect(done("not_allowed"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_memberships")
    .delete()
    .eq("school_id", parsed.data.schoolId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error?.message.includes("at least one owner")) redirect(done("last_owner"));
  redirect(done(error || !data?.length ? "not_allowed" : "member_removed"));
}

export async function leaveSchoolAction(formData: FormData): Promise<void> {
  const schoolId = uuidSchema.safeParse(formData.get("schoolId"));
  if (!schoolId.success) redirect(done("failed"));
  const ctx = await requireAccess();

  const supabase = await createClient();
  const { error } = await supabase
    .from("school_memberships")
    .delete()
    .eq("school_id", schoolId.data)
    .eq("user_id", ctx.user.id);
  if (error?.message.includes("at least one owner")) redirect(done("last_owner"));
  revalidatePath("/", "layout");
  redirect(done(error ? "failed" : "left"));
}

export async function deleteSchoolAction(formData: FormData): Promise<void> {
  const schoolId = uuidSchema.safeParse(formData.get("schoolId"));
  if (!schoolId.success) redirect(done("failed"));
  const { membership } = await requireSchoolRole(schoolId.data, ["owner"]);

  if (String(formData.get("confirmation") ?? "").trim() !== membership.schoolName) redirect(done("failed"));

  const supabase = await createClient();
  const { data, error } = await supabase.from("schools").delete().eq("id", schoolId.data).select("id");
  revalidatePath("/", "layout");
  redirect(done(error || !data?.length ? "not_allowed" : "school_deleted"));
}

/** Accepts an invitation. The database verifies the token, expiry and that the email matches. */
export async function acceptInvitationAction(token: string): Promise<void> {
  await requireAccess({ allowIncompleteOnboarding: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { invite_token: token });
  if (error) redirect(`/invite/${encodeURIComponent(token)}?error=1`);
  revalidatePath("/", "layout");
  redirect(done("joined"));
}
