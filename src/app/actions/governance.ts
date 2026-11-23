"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requireAccess } from "@/lib/auth/session";
import { rpcState } from "@/lib/community/action";

/*
 * Administration. Every action signs the caller in with requireAccess() and then calls a database
 * function that decides, for itself, whether this person may do this. Hiding a button is a courtesy;
 * these checks are the rule.
 */

const uuid = z.uuid();
const reason = (min = 1) => z.string().trim().min(min, "Please give a reason.").max(500, "Please keep it under 500 characters.");
const optionalReason = z.string().trim().max(500, "Please keep it under 500 characters.").default("");

function done(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

// --- Covenant ---------------------------------------------------------------------------------
export async function acceptCovenantAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ version: z.coerce.number().int().positive(), agree: z.literal("on", "Please tick the box to confirm."), adult: z.literal("on", "Please confirm that you are an adult (18 or older).") }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("accept_covenant", { p_version: parsed.data.version, p_adult: true }, "Thank you. You can now take part.");
  done(["/community", "/community/covenant", "/devotional/[id]", "/community/groups"]);
  return result;
}

// --- Discussion controls ---------------------------------------------------------------------
export async function setDiscussionControlsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({ devotionalId: uuid, mode: z.enum(["open", "closed", "disabled"]), note: optionalReason }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const { devotionalId, mode, note } = parsed.data;
  const result = await rpcState(
    "set_discussion_controls",
    { p_devotional: devotionalId, p_enabled: mode !== "disabled", p_closed: mode === "closed", p_note: note },
    mode === "open" ? "Discussion is open." : mode === "closed" ? "Discussion is closed. People can still read it." : "Discussion is turned off for this devotional.",
  );
  done(["/devotional/[id]", "/today", "/admin/devotionals", "/community/moderation"]);
  return result;
}

export async function setPinnedQuestionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({ devotionalId: uuid, question: z.string().trim().max(400, "Keep the question under 400 characters.").default("") }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const result = await rpcState(
    "set_pinned_question",
    { p_devotional: parsed.data.devotionalId, p_question: parsed.data.question },
    parsed.data.question ? "Question pinned." : "Pinned question removed.",
    { values: parsed.echo },
  );
  done(["/devotional/[id]", "/today"]);
  return result;
}

export async function setThreadControlsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({
      contributionId: uuid,
      repliesLocked: z.preprocess((v) => v === "on", z.boolean()),
      acksLocked: z.preprocess((v) => v === "on", z.boolean()),
      reason: optionalReason,
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const result = await rpcState(
    "set_thread_controls",
    { p_contribution: d.contributionId, p_replies_locked: d.repliesLocked, p_acks_locked: d.acksLocked, p_reason: d.reason },
    d.repliesLocked || d.acksLocked ? "Saved. New replies or acknowledgements are stopped on this thread." : "This thread is open again.",
  );
  done(["/devotional/[id]", "/community/moderation"]);
  return result;
}

// --- Group requests and administration -------------------------------------------------------
export async function decideGroupRequestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ groupId: uuid, decision: z.enum(["approve", "reject"]), reason: optionalReason }), formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const result = await rpcState(
    "decide_group_request",
    { p_group: d.groupId, p_approve: d.decision === "approve", p_reason: d.reason },
    d.decision === "approve" ? "Group approved." : "Group declined, and the owner will see why.",
  );
  done(["/community/moderation", "/community/groups"]);
  return result;
}

export async function adminTransferGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ groupId: uuid, newOwner: uuid, reason: reason() }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState(
    "admin_transfer_group_ownership",
    { p_group: parsed.data.groupId, p_new_owner: parsed.data.newOwner, p_reason: parsed.data.reason },
    "Ownership transferred. The previous owner is now a moderator.",
  );
  done(["/community/moderation", "/community/groups"]);
  return result;
}

export async function adminSetGroupRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ groupId: uuid, userId: uuid, role: z.enum(["moderator", "member"]), reason: reason() }), formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const result = await rpcState("admin_set_group_role", { p_group: d.groupId, p_user: d.userId, p_role: d.role, p_reason: d.reason }, "Role updated.");
  done(["/community/moderation"]);
  return result;
}

export async function adminDeleteGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ groupId: uuid, reason: reason(), confirm: z.literal("on", "Please tick the box to confirm.") }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("admin_delete_group", { p_group: parsed.data.groupId, p_reason: parsed.data.reason }, "Group deleted.");
  done(["/community/moderation", "/community/groups"]);
  return result;
}

export async function schoolTransferGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ schoolId: uuid, groupId: uuid, newOwner: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState(
    "school_transfer_group_ownership",
    { p_group: parsed.data.groupId, p_new_owner: parsed.data.newOwner },
    "Ownership transferred.",
  );
  done([`/school/${parsed.data.schoolId}/groups`]);
  return result;
}

export async function schoolDeleteGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ schoolId: uuid, groupId: uuid, confirm: z.literal("on", "Please tick the box to confirm.") }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("school_delete_group", { p_group: parsed.data.groupId }, "Group deleted.");
  done([`/school/${parsed.data.schoolId}/groups`]);
  return result;
}

// --- Escalation and accounts -----------------------------------------------------------------
export async function escalateToAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ reportId: uuid, note: reason() }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("escalate_to_admin", { p_report: parsed.data.reportId, p_note: parsed.data.note }, "Passed to a platform administrator.");
  done(["/community/moderation"]);
  return result;
}

export async function closeEscalationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ reportId: uuid, note: reason() }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("close_admin_escalation", { p_report: parsed.data.reportId, p_note: parsed.data.note }, "Recorded.");
  done(["/community/moderation"]);
  return result;
}

export async function setAccountStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({
      userId: uuid,
      status: z.enum(["suspended", "terminated", "active"]),
      days: z.coerce.number().int().min(1).max(365).default(14),
      reason: reason(),
      confirm: z.literal("on", "Please tick the box to confirm."),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const result = await rpcState(
    "admin_set_account_status",
    { p_user: d.userId, p_status: d.status, p_reason: d.reason, p_days: d.days },
    d.status === "active" ? "Account restored." : d.status === "suspended" ? "Account suspended. The person can see why and appeal." : "Account closed. The person can see why and appeal.",
  );
  done(["/community/moderation", "/admin/audit"]);
  return result;
}

// --- Settings and retention ------------------------------------------------------------------
export async function setGovernanceSettingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ key: z.string().regex(/^[a-z_]{3,60}$/), value: z.string().trim().min(1).max(10) }), formData);
  if (!parsed.ok) return parsed.state;
  let value: unknown;
  try {
    value = JSON.parse(parsed.data.value);
  } catch {
    return errorState("Enter a number, or true or false.");
  }
  const result = await rpcState("set_governance_setting", { k: parsed.data.key, v: value }, "Saved.");
  done(["/admin/audit"]);
  return result;
}

export async function runRetentionAction(_prev: FormState): Promise<FormState> {
  await requireAccess();
  const result = await rpcState("retention_run", {}, "Retention run complete.");
  done(["/admin/audit"]);
  if (result.status === "success" && result.data && typeof result.data === "object") {
    return { ...successState("Retention run complete."), output: JSON.stringify(result.data) };
  }
  return result;
}

// --- Contributors ----------------------------------------------------------------------------
export async function saveContributorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({
      id: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
      name: z.string().trim().min(1, "Enter a name.").max(120, "Keep the name under 120 characters."),
      bio: z.string().trim().max(500, "Keep the bio under 500 characters.").default(""),
      active: z.preprocess((v) => v === "on" || v === undefined, z.boolean()),
      // "" keeps the current photo, "remove" deletes it, a small JPEG data URL (made in the browser) replaces it.
      photo: z.union([
        z.literal(""),
        z.literal("remove"),
        z.string().max(60000, "That photo is too large.").regex(/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "That photo could not be read."),
      ]).default(""),
    }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { id, name, bio, active, photo } = parsed.data;
  const photoChange = photo === "" ? {} : { photo: photo === "remove" ? null : photo };
  const { error } = id
    ? await supabase.from("contributors").update({ name, bio, active, ...photoChange }).eq("id", id)
    : await supabase.from("contributors").insert({ name, bio, active, ...photoChange });
  if (error) return errorState("That could not be saved. Only content editors can manage contributors.", { values: parsed.echo });
  done(["/admin/contributors"]);
  return successState(id ? "Saved." : "Added.");
}

export async function setCreditsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ devotionalId: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  const items: Array<{ contributor_id: string; role: string }> = [];
  for (const role of ["author", "contributor", "reviewer"] as const) {
    for (const v of formData.getAll(`role_${role}`)) {
      const id = uuid.safeParse(v);
      if (id.success) items.push({ contributor_id: id.data, role });
    }
  }
  const result = await rpcState("set_devotional_credits", { p_devotional: parsed.data.devotionalId, p_items: items }, "Credits saved.");
  done([`/admin/devotionals/${parsed.data.devotionalId}`, "/devotional/[id]"]);
  return result;
}

// --- Group post comment lock (group managers) -----------------------------------------------
export async function setGroupPostLockedAction(formData: FormData): Promise<void> {
  await requireAccess();
  const parsed = z.object({ postId: uuid, groupId: uuid, locked: z.enum(["true", "false"]) }).safeParse({
    postId: formData.get("postId"), groupId: formData.get("groupId"), locked: formData.get("locked"),
  });
  if (!parsed.success) return;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.rpc("set_group_post_locked", { p_post: parsed.data.postId, p_locked: parsed.data.locked === "true" });
  revalidatePath(`/community/groups/${parsed.data.groupId}`);
}
