"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requireAccess } from "@/lib/auth/session";
import { generateInviteToken, hashToken } from "@/lib/auth/tokens";
import { getPublicEnv } from "@/lib/env";
import { rpcState } from "@/lib/community/action";
import { communityError } from "@/lib/community/errors";
import { groupCommentSchema, groupInviteSchema, groupPostSchema, groupSchema, requiredReason } from "@/lib/community/schemas";
import { screenGroupText } from "@/lib/community/screening";
import { covenantBlock } from "@/lib/governance/gate";
import { createClient } from "@/lib/supabase/server";

/*
 * Private groups. The database checks membership on every read and write; the checks
 * here exist for friendly messages. Nothing trusts a role or user id from the request
 * except as the TARGET of an action the database then authorizes.
 */

const uuid = z.uuid();
const groupPath = (id: string) => `/community/groups/${id}`;

function ids(formData: FormData, ...keys: string[]) {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const parsed = uuid.safeParse(formData.get(key));
    if (!parsed.success) return null;
    out[key] = parsed.data;
  }
  return out;
}

export async function createGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(groupSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const result = await rpcState(
    "create_group",
    {
      p_name: d.name, p_description: d.description, p_purpose: d.purpose, p_guidelines: d.guidelines,
      p_category: d.category, p_privacy: d.privacy, p_school: d.schoolId ?? null,
    },
    "Group created.",
    { values: parsed.echo },
  );
  if (result.status === "error") return result;
  revalidatePath("/community/groups");
  redirect(groupPath(String(result.data)));
}

export async function updateGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(groupSchema.extend({ groupId: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const result = await rpcState(
    "update_group",
    {
      p_group: d.groupId, p_name: d.name, p_description: d.description, p_purpose: d.purpose,
      p_guidelines: d.guidelines, p_category: d.category, p_privacy: d.privacy,
    },
    "Saved.",
    { values: parsed.echo },
  );
  revalidatePath(groupPath(d.groupId));
  return result;
}

export async function deleteGroupAction(formData: FormData): Promise<void> {
  await requireAccess();
  const v = ids(formData, "groupId");
  if (!v) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_group", { p_group: v.groupId });
  if (error) redirect(`${groupPath(v.groupId!)}/settings?notice=failed`);
  revalidatePath("/community/groups");
  redirect("/community/groups");
}

export async function requestToJoinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ groupId: uuid, message: z.string().trim().max(300, "Keep it under 300 characters.").default("") }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState(
    "request_to_join",
    { p_group: parsed.data.groupId, p_message: parsed.data.message },
    "Your request was sent to the group's leaders.",
    { values: parsed.echo },
  );
  revalidatePath("/community/groups");
  return result;
}

export async function withdrawRequestAction(formData: FormData): Promise<void> {
  await requireAccess();
  const v = ids(formData, "groupId");
  if (!v) return;
  const supabase = await createClient();
  await supabase.rpc("withdraw_join_request", { p_group: v.groupId });
  revalidatePath("/community/groups");
}

export async function decideRequestAction(formData: FormData): Promise<void> {
  await requireAccess();
  const v = ids(formData, "requestId", "groupId");
  if (!v) return;
  const supabase = await createClient();
  await supabase.rpc("decide_join_request", { p_request: v.requestId, p_approve: formData.get("decision") === "approve" });
  revalidatePath(`${groupPath(v.groupId!)}/members`);
}

export async function createGroupInvitationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireAccess();
  const parsed = parseForm(groupInviteSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (parsed.data.email === user.email) return errorState("That is your own email address.", { values: parsed.echo });

  const token = generateInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.from("group_invitations").insert({
    group_id: parsed.data.groupId,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: hashToken(token),
    invited_by: user.id,
  });
  if (error) return errorState(communityError(error, "We could not create the invitation."), { values: parsed.echo });
  revalidatePath(`${groupPath(parsed.data.groupId)}/members`);
  return successState(
    `Invitation created for ${parsed.data.email}. Email delivery is not built yet, so copy this link and send it to them yourself. It works only for that verified email address and expires in 14 days.`,
    { output: `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/community/invite/${token}` },
  );
}

export async function revokeGroupInvitationAction(formData: FormData): Promise<void> {
  await requireAccess();
  const v = ids(formData, "invitationId", "groupId");
  if (!v) return;
  const supabase = await createClient();
  await supabase.from("group_invitations").delete().eq("id", v.invitationId).eq("group_id", v.groupId);
  revalidatePath(`${groupPath(v.groupId!)}/members`);
}

export async function acceptGroupInvitationAction(formData: FormData): Promise<void> {
  await requireAccess();
  const token = z.string().min(10).max(200).safeParse(formData.get("token"));
  if (!token.success) redirect("/community/groups?notice=failed");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_group_invitation", { p_token: token.data });
  if (error) redirect(`/community/invite/${encodeURIComponent(token.data)}?notice=invalid`);
  revalidatePath("/community/groups");
  redirect(groupPath(String(data)));
}

export async function leaveGroupAction(formData: FormData): Promise<void> {
  await requireAccess();
  const v = ids(formData, "groupId");
  if (!v) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_group", { p_group: v.groupId });
  if (error) redirect(`${groupPath(v.groupId!)}/members?notice=last_owner`);
  revalidatePath("/community/groups");
  redirect("/community/groups");
}

async function memberAction(formData: FormData, fn: string, extra: (fd: FormData) => Record<string, unknown> | null) {
  await requireAccess();
  const v = ids(formData, "groupId", "userId");
  const more = extra(formData);
  if (!v || !more) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_group: v.groupId, p_user: v.userId, ...more });
  revalidatePath(`${groupPath(v.groupId!)}/members`);
  if (error) redirect(`${groupPath(v.groupId!)}/members?notice=${encodeURIComponent(error.code === "P0001" ? "last_owner" : "failed")}`);
}

export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const role = z.enum(["member", "moderator"]).safeParse(formData.get("role"));
  await memberAction(formData, "set_group_member_role", () => (role.success ? { p_role: role.data } : null));
}

export async function transferOwnershipAction(formData: FormData): Promise<void> {
  await memberAction(formData, "transfer_group_ownership", () => ({}));
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const reason = requiredReason().safeParse(formData.get("reason"));
  await memberAction(formData, "remove_group_member", () => (reason.success ? { p_reason: reason.data } : null));
}

export async function suspendMemberAction(formData: FormData): Promise<void> {
  const reason = requiredReason().safeParse(formData.get("reason"));
  const days = z.coerce.number().int().min(1).max(365).safeParse(formData.get("days"));
  await memberAction(formData, "suspend_group_member", () =>
    reason.success ? { p_reason: reason.data, p_days: days.success ? days.data : null } : null,
  );
}

export async function unsuspendMemberAction(formData: FormData): Promise<void> {
  await memberAction(formData, "unsuspend_group_member", () => ({}));
}

export async function createGroupPostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireAccess();
  const blocked = await covenantBlock();
  if (blocked) return blocked;
  const parsed = parseForm(groupPostSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const screen = screenGroupText(`${d.title ?? ""} ${d.body}`);
  if (!screen.ok) return errorState(screen.reason, { values: parsed.echo, fieldErrors: { body: screen.reason } });

  const supabase = await createClient();
  const { error } = await supabase.from("group_posts").insert({
    group_id: d.groupId,
    author_id: user.id,
    kind: d.kind,
    title: d.title ?? null,
    body: d.body,
    scripture_reference: d.scriptureReference ?? null,
    devotional_id: d.devotionalId ?? null,
  });
  if (error) return errorState(communityError(error), { values: parsed.echo });
  revalidatePath(groupPath(d.groupId));
  return successState("Posted.");
}

export async function updateGroupPostAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ id: uuid, groupId: uuid, body: groupPostSchema.shape.body, title: groupPostSchema.shape.title }), formData);
  if (!parsed.ok) return parsed.state;
  const screen = screenGroupText(`${parsed.data.title ?? ""} ${parsed.data.body}`);
  if (!screen.ok) return errorState(screen.reason, { values: parsed.echo, fieldErrors: { body: screen.reason } });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("group_posts")
    .update({ body: parsed.data.body, title: parsed.data.title ?? null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length) return errorState(communityError(error, "That could not be changed."), { values: parsed.echo });
  revalidatePath(groupPath(parsed.data.groupId));
  return successState("Saved.");
}

export async function deleteGroupPostAction(formData: FormData): Promise<void> {
  await requireAccess();
  const v = ids(formData, "id", "groupId");
  if (!v) return;
  const supabase = await createClient();
  await supabase.from("group_posts").delete().eq("id", v.id);
  revalidatePath(groupPath(v.groupId!));
}

export async function createGroupCommentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireAccess();
  const blocked = await covenantBlock();
  if (blocked) return blocked;
  const parsed = parseForm(groupCommentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const screen = screenGroupText(d.body);
  if (!screen.ok) return errorState(screen.reason, { values: parsed.echo, fieldErrors: { body: screen.reason } });
  const supabase = await createClient();
  const { error } = await supabase.from("group_comments").insert({
    post_id: d.postId, group_id: d.groupId, author_id: user.id, parent_id: d.parentId ?? null, body: d.body,
  });
  if (error) return errorState(communityError(error), { values: parsed.echo });
  revalidatePath(groupPath(d.groupId));
  return successState("Posted.");
}

export async function deleteGroupCommentAction(formData: FormData): Promise<void> {
  await requireAccess();
  const v = ids(formData, "id", "groupId");
  if (!v) return;
  const supabase = await createClient();
  await supabase.from("group_comments").delete().eq("id", v.id);
  revalidatePath(groupPath(v.groupId!));
}

export async function loadGroupCommentsAction(postId: string): Promise<import("@/lib/community/types").GroupComment[]> {
  await requireAccess();
  if (!uuid.safeParse(postId).success) return [];
  const { listGroupComments } = await import("@/lib/community/queries");
  return listGroupComments(postId);
}
