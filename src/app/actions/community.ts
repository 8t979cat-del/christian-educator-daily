"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requireAccess } from "@/lib/auth/session";
import { rpcState } from "@/lib/community/action";
import { communityError } from "@/lib/community/errors";
import {
  contributionEditSchema,
  contributionSchema,
  replySchema,
  reportSchema,
} from "@/lib/community/schemas";
import { screenPublicText } from "@/lib/community/screening";
import { covenantBlock } from "@/lib/governance/gate";
import { createClient } from "@/lib/supabase/server";

/*
 * Public discussion on published devotionals. Each action: (1) requires a verified,
 * signed-in person; (2) validates and screens what they wrote; (3) writes as that person,
 * so row-level security decides. There is no action that creates a standalone post.
 */

const uuid = z.uuid();
const refresh = (devotionalId: string) => revalidatePath(`/devotional/${devotionalId}`);

export async function createContributionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireAccess();
  const blocked = await covenantBlock();
  if (blocked) return blocked;
  const parsed = parseForm(contributionSchema, formData, { booleans: ["reminderAcknowledged"] });
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;

  for (const text of [d.body, d.title ?? ""]) {
    const screen = screenPublicText(text);
    if (!screen.ok) return errorState(screen.reason, { values: parsed.echo, fieldErrors: { body: screen.reason } });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("community_contributions").insert({
    devotional_id: d.devotionalId,
    user_id: user.id,
    kind: d.kind,
    title: d.title ?? null,
    body: d.body,
    visibility: d.visibility,
  });
  if (error) return errorState(communityError(error), { values: parsed.echo });
  refresh(d.devotionalId);
  return successState(d.kind === "prayer" ? "Your prayer was shared." : "Thank you. Your contribution was shared.");
}

export async function updateContributionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(contributionEditSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const screen = screenPublicText(`${d.title ?? ""} ${d.body}`);
  if (!screen.ok) return errorState(screen.reason, { values: parsed.echo, fieldErrors: { body: screen.reason } });

  const supabase = await createClient();
  const changes: Record<string, unknown> = { body: d.body, title: d.title ?? null };
  if (d.visibility) changes.visibility = d.visibility;
  const { data, error } = await supabase.from("community_contributions").update(changes).eq("id", d.id).select("id");
  if (error) return errorState(communityError(error), { values: parsed.echo });
  if (!data?.length) return errorState("That could not be changed.", { values: parsed.echo });
  refresh(d.devotionalId);
  return successState("Saved.");
}

export async function deleteContributionAction(formData: FormData): Promise<void> {
  await requireAccess();
  const parsed = z.object({ id: uuid, devotionalId: uuid }).safeParse({
    id: formData.get("id"),
    devotionalId: formData.get("devotionalId"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("community_contributions").delete().eq("id", parsed.data.id);
  refresh(parsed.data.devotionalId);
}

export async function createReplyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireAccess();
  const blocked = await covenantBlock();
  if (blocked) return blocked;
  const parsed = parseForm(replySchema, formData);
  if (!parsed.ok) return parsed.state;
  const screen = screenPublicText(parsed.data.body);
  if (!screen.ok) return errorState(screen.reason, { values: parsed.echo, fieldErrors: { body: screen.reason } });

  const supabase = await createClient();
  const { error } = await supabase
    .from("contribution_replies")
    .insert({ contribution_id: parsed.data.contributionId, user_id: user.id, body: parsed.data.body });
  if (error) return errorState(communityError(error), { values: parsed.echo });
  refresh(parsed.data.devotionalId);
  return successState("Reply posted.");
}

export async function deleteReplyAction(formData: FormData): Promise<void> {
  await requireAccess();
  const parsed = z.object({ id: uuid, devotionalId: uuid }).safeParse({
    id: formData.get("id"),
    devotionalId: formData.get("devotionalId"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("contribution_replies").delete().eq("id", parsed.data.id);
  refresh(parsed.data.devotionalId);
}

type PrayResult = { ok: true; count: number; prayed: boolean } | { ok: false; error: string };

/** "I prayed for this." Returns the new count for that one prayer; nothing is ranked or aggregated. */
export async function setPrayedAction(
  target: { contributionId?: string; groupPostId?: string },
  on: boolean,
): Promise<PrayResult> {
  await requireAccess();
  const blocked = await covenantBlock();
  if (blocked) return { ok: false, error: blocked.message ?? "Please accept the community covenant first." };
  const parsed = z
    .object({ contributionId: uuid.optional(), groupPostId: uuid.optional(), on: z.boolean() })
    .refine((v) => Boolean(v.contributionId) !== Boolean(v.groupPostId))
    .safeParse({ ...target, on });
  if (!parsed.success) return { ok: false, error: "That could not be saved." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("acknowledge_prayer", {
    p_contribution: parsed.data.contributionId ?? null,
    p_group_post: parsed.data.groupPostId ?? null,
    p_on: parsed.data.on,
  });
  if (error) return { ok: false, error: communityError(error) };
  return { ok: true, count: Number(data ?? 0), prayed: parsed.data.on };
}

export async function reportContentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(reportSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return rpcState(
    "report_content",
    { p_type: d.targetType, p_id: d.targetId, p_reason: d.reason, p_details: d.details ?? null, p_urgent: d.urgent },
    "Thank you. A moderator will look at this with care. The person is not told who reported.",
    { values: parsed.echo },
  );
}

export async function blockAuthorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = z
    .object({ targetType: z.enum(["contribution", "reply", "group_post", "group_comment"]), targetId: uuid })
    .safeParse({ targetType: formData.get("targetType"), targetId: formData.get("targetId") });
  if (!parsed.success) return errorState("That could not be done.");
  revalidatePath("/community", "layout");
  revalidatePath("/devotional/[id]", "page");
  return rpcState(
    "block_author",
    { p_type: parsed.data.targetType, p_id: parsed.data.targetId },
    "Done. You will no longer see this person's contributions. They are not told.",
  );
}

export async function unblockAction(formData: FormData): Promise<void> {
  await requireAccess();
  const id = uuid.safeParse(formData.get("blockedId"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("user_blocks").delete().eq("blocked_id", id.data);
  revalidatePath("/community/notices");
  revalidatePath("/devotional/[id]", "page");
}

/** Lets a teacher hide "Reflect Together" everywhere and use devotionals privately. */
export async function setShowDiscussionsAction(show: boolean): Promise<{ ok: boolean }> {
  const { user } = await requireAccess();
  if (typeof show !== "boolean") return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ show_discussions: show }).eq("id", user.id);
  if (error) return { ok: false };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Replies load when a thread is opened, so a page of discussion stays light. */
export async function loadRepliesAction(contributionId: string): Promise<import("@/lib/community/types").Reply[]> {
  await requireAccess();
  if (!uuid.safeParse(contributionId).success) return [];
  const { listReplies } = await import("@/lib/community/queries");
  return listReplies(contributionId);
}
