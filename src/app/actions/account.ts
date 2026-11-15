"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorState, parseForm, successState, type FormState } from "@/lib/auth/form-state";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  changePasswordSchema,
  deleteAccountSchema,
  notificationSchema,
  onboardingSchema,
  profileSchema,
} from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { reminderSchema } from "@/lib/content/reminders";
import { createAdminClient, createStatelessClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PROFILE_SPEC = { arrays: ["gradeLevels", "subjects"] } as const;
const NOTIFICATION_BOOLEANS = ["notifyAssignments", "notifyCommunity", "notifyProduct"] as const;

const SAVE_FAILED = "We could not save your changes. Please try again.";

type ProfileInput = ReturnType<typeof profileSchema.parse>;

const profileColumns = (data: ProfileInput) => ({
  first_name: data.firstName,
  last_name: data.lastName,
  display_name: `${data.firstName} ${data.lastName}`.trim(),
  educational_role: data.educationalRole,
  grade_levels: data.gradeLevels,
  subjects: data.subjects,
  school_affiliation: data.schoolAffiliation,
  denomination: data.denomination,
  default_translation: data.defaultTranslation,
});

/** Writes columns to the CURRENT user's profile. The id always comes from the session, never from the form. */
async function saveProfile(userId: string, columns: Record<string, unknown>): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update(columns).eq("id", userId).select("id");
  return !error && (data?.length ?? 0) === 1;
}

export async function completeOnboardingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess({ allowIncompleteOnboarding: true });
  const parsed = parseForm(onboardingSchema, formData, { ...PROFILE_SPEC, booleans: NOTIFICATION_BOOLEANS });
  if (!parsed.ok) return parsed.state;

  const { emailFrequency, notifyAssignments, notifyCommunity, notifyProduct, ...profile } = parsed.data;
  const saved = await saveProfile(ctx.user.id, {
    ...profileColumns(profile),
    email_frequency: emailFrequency,
    notify_assignments: notifyAssignments,
    notify_community: notifyCommunity,
    notify_product: notifyProduct,
    onboarding_completed_at: new Date().toISOString(),
  });
  if (!saved) return errorState(SAVE_FAILED, { values: parsed.echo });

  revalidatePath("/", "layout");
  // New educators land on the short welcome tour; a saved destination still wins.
  redirect(safeNextPath(formData.get("next"), "/welcome"));
}

export async function updateProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  const parsed = parseForm(profileSchema, formData, PROFILE_SPEC);
  if (!parsed.ok) return parsed.state;

  if (!(await saveProfile(ctx.user.id, profileColumns(parsed.data)))) {
    return errorState(SAVE_FAILED, { values: parsed.echo });
  }
  revalidatePath("/", "layout");
  return successState("Your profile was saved.");
}

export async function updateNotificationsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  const parsed = parseForm(notificationSchema, formData, { booleans: NOTIFICATION_BOOLEANS });
  if (!parsed.ok) return parsed.state;

  const saved = await saveProfile(ctx.user.id, {
    email_frequency: parsed.data.emailFrequency,
    notify_assignments: parsed.data.notifyAssignments,
    notify_community: parsed.data.notifyCommunity,
    notify_product: parsed.data.notifyProduct,
  });
  if (!saved) return errorState(SAVE_FAILED, { values: parsed.echo });
  revalidatePath("/settings");
  return successState("Your notification preferences were saved.");
}

export async function updateReminderAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  const parsed = parseForm(reminderSchema, formData, { booleans: ["reminderEnabled"] });
  if (!parsed.ok) return parsed.state;
  const { reminderEnabled, reminderTime, reminderDays } = parsed.data;

  const saved = await saveProfile(ctx.user.id, {
    reminder_enabled: reminderEnabled,
    reminder_time: reminderTime,
    reminder_days: reminderDays,
  });
  if (!saved) return errorState(SAVE_FAILED, { values: parsed.echo });
  revalidatePath("/settings");
  return successState(
    reminderEnabled ? "Reminder saved. Add it to your calendar below." : "Reminder turned off.",
    // Booleans are not echoed by the form helper; report the saved state explicitly.
    { values: { reminderEnabled: reminderEnabled ? "on" : "", reminderTime, reminderDays } },
  );
}

/** Re-checks a password without touching the user's session cookies. */
async function passwordIsCorrect(email: string, password: string): Promise<boolean> {
  const { error } = await createStatelessClient().auth.signInWithPassword({ email, password });
  return !error;
}

export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess();
  const parsed = parseForm(changePasswordSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (!(await passwordIsCorrect(ctx.user.email, parsed.data.currentPassword))) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: { currentPassword: "That is not your current password." },
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) {
    return errorState(
      error.code === "weak_password" ? error.message : "We could not change your password. Please try again.",
    );
  }
  return successState("Your password was changed.");
}

export async function deleteAccountAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAccess({ allowIncompleteOnboarding: true });
  const parsed = parseForm(deleteAccountSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (!(await passwordIsCorrect(ctx.user.email, parsed.data.password))) {
    return errorState("Please fix the highlighted fields.", {
      fieldErrors: { password: "That password is incorrect." },
    });
  }

  // Sole owners must hand the school over first. The database also enforces this.
  const supabase = await createClient();
  const { data: blockers } = await supabase.rpc("account_deletion_blockers");
  if (Array.isArray(blockers) && blockers.length > 0) {
    const billing = (blockers as string[]).filter((b) => b.startsWith("billing:"));
    const owned = (blockers as string[]).filter((b) => !b.startsWith("billing:"));
    if (billing.length > 0) {
      return errorState(
        "You have an active subscription. Cancel it in Billing first, so you are never charged for an account that no longer exists. Your plan then runs to the end of the period you paid for.",
      );
    }
    return errorState(
      `You are the only owner of ${owned.join(", ")}. Make someone else an owner, or delete the school, before deleting your account.`,
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return errorState("Account deletion is not configured on this server (SUPABASE_SERVICE_ROLE_KEY is missing).");
  }
  const { error } = await admin.auth.admin.deleteUser(ctx.user.id);
  if (error) return errorState("We could not delete your account. Please contact support.");

  await supabase.auth.signOut().catch(() => undefined);
  redirect("/");
}
