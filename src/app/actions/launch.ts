"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { requireAccess, requirePlatformRole } from "@/lib/auth/session";
import { COMMUNITY_FLAGS, OTHER_FLAGS } from "@/lib/launch/flags";
import { log } from "@/lib/ops/log";
import { createClient } from "@/lib/supabase/server";

/*
 * Launch, pilot and feedback actions. Each one checks the caller's role, then calls a database function that checks it again.
 * The database messages for these functions are written for people, so they are shown as they are; anything unexpected is logged and replaced.
 */
const SAFE_CODES = new Set(["P0001", "P0002", "22023", "42501", "28000", "23505", "23514"]);

function failure(error: { code?: string; message: string }, event: string): FormState {
  if (error.code && SAFE_CODES.has(error.code) && error.message.length < 300) return errorState(error.message);
  log("error", event, { code: error.code });
  return errorState("Something went wrong. Nothing was changed. Please try again.");
}

const flagKey = z.enum([...COMMUNITY_FLAGS, ...OTHER_FLAGS]);
const uuid = z.string().uuid();

/** Turn one switch on or off. Closing is always allowed; opening an interactive feature is refused by the database until readiness is complete. */
export async function setFlagAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({ key: flagKey, value: z.enum(["true", "false"]) }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_community_setting", { k: parsed.data.key, v: parsed.data.value === "true" });
  if (error) return failure(error, "set_flag_failed");
  revalidatePath("/admin/launch");
  revalidatePath("/community/moderation");
  return successState(parsed.data.value === "true" ? "Switched on." : "Switched off.");
}

export async function attestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({ key: z.string().min(1).max(60), note: z.string().trim().min(10, "Say what was done, in a sentence.").max(600) }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc("attest_launch", { p_key: parsed.data.key, p_note: parsed.data.note });
  if (error) return failure(error, "attest_failed");
  revalidatePath("/admin/launch");
  return successState("Recorded.");
}

export async function retractAttestationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({ key: z.string().min(1).max(60) }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc("retract_launch_attestation", { p_key: parsed.data.key });
  if (error) return failure(error, "retract_failed");
  revalidatePath("/admin/launch");
  return successState("Sign-off withdrawn.");
}

/** Runs an administrator-only database function and refreshes the pilot screens. */
async function pilotCall(fn: string, args: Record<string, unknown>, ok: string, extra?: (data: unknown) => Partial<FormState>): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return failure(error, `${fn}_failed`);
  revalidatePath("/admin/pilot", "layout");
  return successState(ok, extra?.(data));
}

export async function createPilotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({
    name: z.string().trim().min(2).max(120), starts_on: z.string().date(), ends_on: z.string().date(), seats: z.coerce.number().int().min(1).max(500),
  }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_create", { p_name: parsed.data.name, p_starts_on: parsed.data.starts_on, p_ends_on: parsed.data.ends_on, p_seat_limit: parsed.data.seats }, "Pilot created in planning. Nothing is open to anyone yet.");
}
export async function setPilotStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ pilot: uuid, status: z.enum(["planning", "active", "closed"]) }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_set_status", { p_pilot: parsed.data.pilot, p_status: parsed.data.status }, "Pilot status updated.");
}
export async function addPilotSchoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ pilot: uuid, name: z.string().trim().min(2).max(120), contact: z.string().trim().max(120).default("") }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_add_school", { p_pilot: parsed.data.pilot, p_name: parsed.data.name, p_contact: parsed.data.contact }, "Added as a prospect. It has no access until you record that it agreed.");
}
export async function setSchoolStageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ ps: uuid, stage: z.enum(["prospect", "invited", "agreed", "declined", "completed"]), note: z.string().trim().max(600).default("") }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_set_school_stage", { p_pilot_school: parsed.data.ps, p_stage: parsed.data.stage, p_note: parsed.data.note }, "School stage updated.");
}
export async function createPilotSchoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ ps: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_create_school", { p_pilot_school: parsed.data.ps }, "The school account now exists. Create access codes for its people.");
}
export async function setSchoolSeatsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ ps: uuid, seats: z.coerce.number().int().min(1).max(500) }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_set_school_seats", { p_pilot_school: parsed.data.ps, p_seats: parsed.data.seats }, "Seat limit updated.");
}
export async function setConversionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ ps: uuid, stage: z.enum(["none", "interested", "proposal_sent", "converted", "declined"]), note: z.string().trim().max(600).default("") }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_set_conversion", { p_pilot_school: parsed.data.ps, p_stage: parsed.data.stage, p_note: parsed.data.note }, "Conversion stage updated.");
}
/** The code is returned once, here. It is stored only as a hash and cannot be shown again. */
export async function createCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({
    ps: uuid, grants: z.enum(["owner", "faculty"]), uses: z.coerce.number().int().min(1).max(500), days: z.coerce.number().int().min(1).max(366), label: z.string().trim().max(80).default(""),
  }), formData);
  if (!parsed.ok) return parsed.state;
  const expires = new Date(Date.now() + parsed.data.days * 86_400_000).toISOString();
  return pilotCall("pilot_create_code",
    { p_pilot_school: parsed.data.ps, p_grants: parsed.data.grants, p_max_uses: parsed.data.grants === "owner" ? 1 : parsed.data.uses, p_expires_at: expires, p_label: parsed.data.label },
    "Copy this code now. It is shown only once; send it to the person directly.", (data) => ({ output: String(data) }));
}
export async function revokeCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ code: uuid }), formData);
  if (!parsed.ok) return parsed.state;
  return pilotCall("pilot_revoke_code", { p_code: parsed.data.code }, "Code revoked.");
}

// ---- Educator-facing -------------------------------------------------------------------------------------
const REASONS: Record<string, string> = {
  invalid: "That code did not work. Check it and try again, or ask the person who gave it to you.",
  exhausted: "That code has already been used as many times as it allows. Ask your school for a new one.",
  throttled: "Too many tries. Please wait an hour and try again.",
};

export async function redeemCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ code: z.string().trim().min(8, "Enter the whole code.").max(30) }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_pilot_code", { p_code: parsed.data.code });
  if (error) return failure(error, "redeem_failed");
  const r = data as { ok: boolean; reason?: string; school_name?: string; already?: boolean };
  if (!r.ok) return errorState(REASONS[r.reason ?? "invalid"] ?? REASONS.invalid!);
  revalidatePath("/", "layout");
  return successState(r.already ? `You are already part of ${r.school_name}.` : `Welcome. You are now part of ${r.school_name}'s pilot.`);
}

export async function pilotInterestAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({ kind: z.enum(["individual_plus", "school_license", "not_now", "need_more_info"]), note: z.string().trim().max(500).default("") }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc("express_pilot_interest", { p_kind: parsed.data.kind, p_note: parsed.data.note });
  if (error) return failure(error, "interest_failed");
  revalidatePath("/pilot");
  return successState("Thank you. This is only a note of interest. Nothing is purchased and nothing is charged.");
}

const RATING_KEYS = ["ease_of_use", "classroom_presentation", "devotional_quality", "time_saved", "community_usefulness", "prayer_interactions", "group_participation"] as const;

export async function submitFeedbackAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess();
  const parsed = parseForm(z.object({
    kind: z.enum(["survey", "bug", "feature"]),
    title: z.string().trim().max(120).default(""),
    body: z.string().trim().max(2000).default(""),
    willingness: z.enum(["yes", "maybe", "no", "unsure", ""]).default(""),
    severity: z.enum(["blocking", "annoying", "minor", ""]).default(""),
    page: z.string().max(200).default(""),
    follow_up: z.string().optional(),
  }), formData);
  if (!parsed.ok) return parsed.state;
  const ratings: Record<string, number> = {};
  for (const k of RATING_KEYS) {
    const v = formData.get(`r_${k}`);
    if (typeof v === "string" && v !== "") ratings[k] = Number(v);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_feedback", {
    p_kind: parsed.data.kind, p_title: parsed.data.title, p_body: parsed.data.body, p_ratings: ratings,
    p_willingness: parsed.data.willingness || null, p_page: parsed.data.page || null, p_severity: parsed.data.severity || null, p_follow_up: parsed.data.follow_up === "on",
  });
  if (error) {
    const s = failure(error, "submit_feedback_failed");
    return { ...s, values: parsed.echo };
  }
  return successState("Thank you. This was sent to the team, and nobody else can see it.");
}

export async function triageFeedbackAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(z.object({
    id: uuid, status: z.enum(["new", "triaged", "planned", "done", "declined"]), priority: z.enum(["unset", "high", "medium", "low"]),
    theme: z.string().min(2).max(40), note: z.string().trim().max(1000).default(""),
  }), formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.rpc("triage_feedback", { p_id: parsed.data.id, p_status: parsed.data.status, p_priority: parsed.data.priority, p_theme: parsed.data.theme, p_note: parsed.data.note });
  if (error) return failure(error, "triage_failed");
  revalidatePath("/admin/feedback");
  return successState("Saved.");
}
