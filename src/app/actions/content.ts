"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { uuidSchema } from "@/lib/auth/schemas";
import { requirePlatformRole } from "@/lib/auth/session";
import { zonedTimeToIso } from "@/lib/content/dates";
import { getSiteTimeZone } from "@/lib/env";
import { devotionalSchema, themeSchema, transitionSchema, translationSchema } from "@/lib/content/schemas";
import { createClient } from "@/lib/supabase/server";

const EDITORS = ["content_editor", "platform_admin"] as const;

const DEVOTIONAL_FORM = { arrays: ["gradeLevels"], secret: [] as string[] };

type PgError = { code?: string; message: string } | null;

/** Messages raised by our own database functions (SQLSTATE P0001) are written for people. Others are not shown. */
function describe(error: PgError, fallback: string): string {
  if (!error) return fallback;
  if (error.code === "P0001") return error.message.charAt(0).toUpperCase() + error.message.slice(1) + (/[.!?]$/.test(error.message) ? "" : ".");
  if (error.code === "42501") return "You do not have permission to do that.";
  if (error.code === "23505") return "Another devotional is already scheduled or live for that date, or that theme already has one on that day.";
  return fallback;
}

/** Creates or updates a devotional. Saving never publishes. */
export async function saveDevotionalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole([...EDITORS]);
  const parsed = parseForm(devotionalSchema, formData, DEVOTIONAL_FORM);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;

  const row = {
    title: d.title,
    devotional_date: d.devotionalDate,
    theme_id: d.themeId,
    daily_topic: d.dailyTopic,
    category_slug: d.categorySlug,
    scripture_reference: d.scriptureReference,
    translation_code: d.translationCode,
    scripture_text: d.scriptureText,
    reflection: d.reflection,
    prayer: d.prayer,
    discussion_question: d.discussionQuestion,
    practical_application: d.practicalApplication,
    levels: d.levels,
    audience: d.audience,
    access_level: d.accessLevel,
    grade_levels: d.gradeLevels,
    educational_category: d.educationalCategory,
    author_name: d.authorName,
  };

  const supabase = await createClient();
  const id = d.id || null;

  if (!id) {
    const { data, error } = await supabase.from("devotionals").insert(row).select("id").single();
    if (error || !data) {
      const licence = error?.message.includes("licence");
      return errorState(describe(error, "The devotional could not be saved."), {
        values: parsed.echo,
        ...(licence ? { fieldErrors: { scriptureText: "This translation's licence does not allow its text to be stored." } } : {}),
      });
    }
    // Started from a teacher's submission: mark it accepted, linked to this draft.
    const submissionId = formData.get("submissionId");
    if (typeof submissionId === "string" && uuidSchema.safeParse(submissionId).success) {
      await supabase.rpc("review_submission", { p_id: submissionId, p_decision: "accepted", p_note: "", p_devotional: data.id });
      revalidatePath("/admin/submissions");
    }
    revalidatePath("/admin/devotionals");
    redirect(`/admin/devotionals/${data.id}?notice=devotional_created`);
  }

  const { data: before } = await supabase.from("devotionals").select("status").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("devotionals").update(row).eq("id", id).select("id, status").maybeSingle();
  if (error || !data) {
    const licence = error?.message.includes("licence");
    return errorState(error ? describe(error, "The devotional could not be saved.") : "That devotional no longer exists or you cannot edit it.", {
      values: parsed.echo,
      ...(licence ? { fieldErrors: { scriptureText: "This translation's licence does not allow its text to be stored." } } : {}),
    });
  }
  revalidatePath("/admin/devotionals");
  revalidatePath(`/admin/devotionals/${id}`);

  const demoted = before && (before.status === "approved" || before.status === "scheduled") && data.status === "draft";
  return successState(
    demoted
      ? "Saved. Because it had already been approved, it is back in draft and needs review and approval again."
      : "Saved. Nothing has been published.",
    // React resets the form after an action; echo the saved values so the fields keep them.
    { values: { ...parsed.echo, scriptureReference: d.scriptureReference } },
  );
}

/** Moves a devotional along the editorial workflow. The database function checks the role, the step, completeness and licensing. */
export async function transitionDevotionalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole([...EDITORS]);
  const parsed = transitionSchema.safeParse({
    id: formData.get("id"),
    to: formData.get("to"),
    publishLocal: formData.get("publishLocal") ?? undefined,
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return errorState("That request was not valid.");
  const { id, to, publishLocal, note } = parsed.data;

  let publishAt: string | null = null;
  if (to === "scheduled") {
    publishAt = publishLocal ? zonedTimeToIso(publishLocal, getSiteTimeZone()) : null;
    if (!publishAt) return errorState("Choose the date and time to publish.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transition_devotional", {
    p_id: id,
    p_to: to,
    p_publish_at: publishAt,
    p_note: note || null,
  });
  if (error) {
    // The workflow checks the saved devotional, not what is typed in the form but not yet saved.
    const missing = /^missing required fields: (.+)$/.exec(error.message)?.[1];
    if (missing) return errorState(`These are still empty in the saved devotional: ${missing}. Fill them in, click Save changes, then try this step again.`);
    return errorState(describe(error, "That step could not be completed."));
  }

  revalidatePath("/admin/devotionals");
  revalidatePath(`/admin/devotionals/${id}`);
  revalidatePath("/today");
  revalidatePath("/archive");
  return successState("Done.");
}

export async function deleteDevotionalAction(formData: FormData): Promise<void> {
  await requirePlatformRole([...EDITORS]);
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/devotionals?notice=failed");
  const supabase = await createClient();
  const { data } = await supabase.from("devotionals").delete().eq("id", id.data).select("id");
  revalidatePath("/admin/devotionals");
  // Row-level security only lets editors delete drafts; anything else deletes nothing.
  redirect(data && data.length > 0 ? "/admin/devotionals?notice=devotional_deleted" : "/admin/devotionals?notice=cannot_delete");
}

// ---------------------------------------------------------------------------
// Weekly themes
// ---------------------------------------------------------------------------

export async function createThemeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePlatformRole([...EDITORS]);
  const parsed = parseForm(themeSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_themes")
    .insert({
      title: parsed.data.title,
      summary: parsed.data.summary,
      week_start: parsed.data.weekStart,
      category_slug: parsed.data.categorySlug,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    return errorState(
      error?.code === "23505" ? "A theme already exists for that week." : "The theme could not be created.",
      { values: parsed.echo },
    );
  }
  revalidatePath("/admin/themes");
  redirect(`/admin/themes/${data.id}?notice=theme_created`);
}

export async function updateThemeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole([...EDITORS]);
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return errorState("That theme was not found.");
  const parsed = parseForm(themeSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weekly_themes")
    .update({
      title: parsed.data.title,
      summary: parsed.data.summary,
      week_start: parsed.data.weekStart,
      category_slug: parsed.data.categorySlug,
    })
    .eq("id", id.data)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return errorState(
      error?.code === "23505" ? "A theme already exists for that week." : describe(error, "The theme could not be saved."),
      { values: parsed.echo },
    );
  }
  revalidatePath(`/admin/themes/${id.data}`);
  return successState("Theme saved.");
}

export async function deleteThemeAction(formData: FormData): Promise<void> {
  await requirePlatformRole([...EDITORS]);
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) redirect("/admin/themes?notice=failed");
  const supabase = await createClient();
  const { data, error } = await supabase.from("weekly_themes").delete().eq("id", id.data).select("id");
  revalidatePath("/admin/themes");
  // A theme that still has devotionals cannot be deleted (foreign key), nor can a published one (policy).
  redirect(!error && data && data.length > 0 ? "/admin/themes?notice=theme_deleted" : "/admin/themes?notice=cannot_delete_theme");
}

export async function publishThemeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole([...EDITORS]);
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return errorState("That theme was not found.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_weekly_theme", { p_theme: id.data, p_timezone: getSiteTimeZone() });
  if (error) return errorState(describe(error, "The week could not be published."));
  revalidatePath(`/admin/themes/${id.data}`);
  revalidatePath("/admin/devotionals");
  revalidatePath("/today");
  revalidatePath("/archive");
  return successState(`Published the week: ${data} devotionals are live or scheduled for their days.`);
}

export async function unscheduleThemeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requirePlatformRole([...EDITORS]);
  const id = uuidSchema.safeParse(formData.get("id"));
  if (!id.success) return errorState("That theme was not found.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unschedule_weekly_theme", { p_theme: id.data });
  if (error) return errorState(describe(error, "The week could not be unscheduled."));
  revalidatePath(`/admin/themes/${id.data}`);
  revalidatePath("/admin/devotionals");
  return successState(`Unscheduled ${data} devotionals. Any that are already live stay live.`);
}

// ---------------------------------------------------------------------------
// Translation licensing (platform administrators only)
// ---------------------------------------------------------------------------

export async function saveTranslationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requirePlatformRole(["platform_admin"]);
  const parsed = parseForm(translationSchema, formData, { booleans: ["textAllowed"] });
  if (!parsed.ok) return parsed.state;
  const t = parsed.data;
  const isNew = formData.get("mode") === "create";

  const record = {
    name: t.name,
    license_type: t.licenseType,
    text_allowed: t.textAllowed,
    attribution: t.attribution === "" ? null : t.attribution,
    license_notes: t.licenseNotes === "" ? null : t.licenseNotes,
    license_verified_by: user.id,
    license_verified_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { error } = isNew
    ? await supabase.from("bible_translations").insert({ code: t.code, ...record })
    : await supabase.from("bible_translations").update(record).eq("code", t.code);
  if (error) {
    return errorState(error.code === "23505" ? "A translation with that code already exists." : "The licence record could not be saved.", {
      values: parsed.echo,
    });
  }
  revalidatePath("/admin/translations");
  return successState(
    t.textAllowed
      ? `Saved ${t.name}. Its text may now be stored and shown, with the attribution you entered.`
      : `Saved ${t.name}. Any text already stored for it has been removed; references still display.`,
  );
}

