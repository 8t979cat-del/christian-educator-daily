"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseForm, type FormState } from "@/lib/auth/form-state";
import { requireAccess, requirePlatformRole } from "@/lib/auth/session";
import { rpcState } from "@/lib/community/action";
import { requiredReason } from "@/lib/community/schemas";
import { createClient } from "@/lib/supabase/server";

/*
 * Moderation. The database decides who may act on what (including that nobody moderates
 * their own content or rules on a report they filed). Page-level role checks here only
 * keep the screens out of sight of people who cannot use them.
 */

const uuid = z.uuid();
const refresh = () => {
  revalidatePath("/community/moderation");
  revalidatePath("/community/groups", "layout");
  revalidatePath("/community/notices");
};

export async function resolveReportAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({ reportId: uuid, decision: z.enum(["dismiss", "hide", "warn"]), note: z.string().trim().max(1000).default("") }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const result = await rpcState(
    "resolve_report",
    { p_report: parsed.data.reportId, p_decision: parsed.data.decision, p_note: parsed.data.note },
    parsed.data.decision === "dismiss" ? "Report dismissed." : parsed.data.decision === "hide" ? "Hidden, and the author was told why." : "Warning recorded.",
    { values: parsed.echo },
  );
  refresh();
  return result;
}

export async function escalateReportAction(formData: FormData): Promise<void> {
  await requireAccess();
  const id = uuid.safeParse(formData.get("reportId"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("escalate_report", { p_report: id.data });
  refresh();
}

export async function restoreContentAction(formData: FormData): Promise<void> {
  await requireAccess();
  const parsed = z
    .object({ type: z.enum(["contribution", "reply", "group_post", "group_comment"]), id: uuid })
    .safeParse({ type: formData.get("type"), id: formData.get("id") });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc("restore_content", { p_type: parsed.data.type, p_id: parsed.data.id, p_note: String(formData.get("note") ?? "").slice(0, 1000) });
  refresh();
  revalidatePath("/devotional/[id]", "page");
}

export async function restrictUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin", "moderator"]);
  const parsed = parseForm(
    z.object({ reportId: uuid, userId: uuid, kind: z.enum(["suspension", "ban"]), days: z.coerce.number().int().min(1).max(365).default(7), reason: requiredReason() }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const result = await rpcState(
    "restrict_user",
    { p_user: parsed.data.userId, p_kind: parsed.data.kind, p_days: parsed.data.days, p_reason: parsed.data.reason, p_report: parsed.data.reportId },
    "Restriction applied.",
    { values: parsed.echo },
  );
  refresh();
  return result;
}

export async function liftRestrictionAction(formData: FormData): Promise<void> {
  await requirePlatformRole(["platform_admin", "moderator"]);
  const id = uuid.safeParse(formData.get("restrictionId"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("lift_restriction", { p_restriction: id.data, p_note: "" });
  refresh();
}

export async function fileAppealAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ actionId: uuid, message: z.string().trim().min(1, "Please tell us why.").max(1500, "Please keep this under 1,500 characters.") }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("file_appeal", { p_action: parsed.data.actionId, p_message: parsed.data.message }, "Your appeal was sent. A different moderator will review it.", { values: parsed.echo });
  refresh();
  return result;
}

export async function resolveAppealAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin", "moderator"]);
  const parsed = parseForm(z.object({ appealId: uuid, decision: z.enum(["uphold", "overturn"]), note: requiredReason("explanation") }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("resolve_appeal", { p_appeal: parsed.data.appealId, p_decision: parsed.data.decision, p_note: parsed.data.note }, parsed.data.decision === "overturn" ? "Overturned and restored." : "The original decision stands.", { values: parsed.echo });
  refresh();
  return result;
}

export async function suspendGroupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin", "moderator"]);
  const parsed = parseForm(z.object({ groupId: uuid, reason: requiredReason() }), formData);
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("suspend_group", { p_group: parsed.data.groupId, p_reason: parsed.data.reason }, "The group was suspended.", { values: parsed.echo });
  refresh();
  return result;
}

export async function unsuspendGroupAction(formData: FormData): Promise<void> {
  await requirePlatformRole(["platform_admin", "moderator"]);
  const id = uuid.safeParse(formData.get("groupId"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.rpc("unsuspend_group", { p_group: id.data });
  refresh();
}

export async function setCommunitySettingAction(formData: FormData): Promise<void> {
  await requirePlatformRole(["platform_admin"]);
  const key = z.enum(["public_discussions_enabled", "groups_enabled", "group_creation", "max_groups_owned_per_user"]).safeParse(formData.get("key"));
  if (!key.success) return;
  const raw = String(formData.get("value") ?? "");
  let value: unknown;
  if (key.data === "group_creation") {
    const v = z.enum(["verified", "school_admins", "staff"]).safeParse(raw);
    if (!v.success) return;
    value = v.data;
  } else if (key.data === "max_groups_owned_per_user") {
    const n = z.coerce.number().int().min(1).max(20).safeParse(raw);
    if (!n.success) return;
    value = n.data;
  } else {
    value = raw === "true";
  }
  const supabase = await createClient();
  await supabase.rpc("set_community_setting", { k: key.data, v: value });
  revalidatePath("/community/moderation");
}


export async function hideContentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(
    z.object({ type: z.enum(["contribution", "reply", "group_post", "group_comment"]), id: uuid, reason: requiredReason("reason") }),
    formData,
  );
  if (!parsed.ok) return parsed.state;
  const result = await rpcState("hide_content", { p_type: parsed.data.type, p_id: parsed.data.id, p_reason: parsed.data.reason }, "Hidden. The author was told why.", { values: parsed.echo });
  refresh();
  revalidatePath("/devotional/[id]", "page");
  return result;
}
