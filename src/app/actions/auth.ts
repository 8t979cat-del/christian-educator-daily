"use server";

import { redirect } from "next/navigation";
import {
  errorState,
  parseForm,
  successState,
  type FormState,
} from "@/lib/auth/form-state";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  emailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { requireUser } from "@/lib/auth/session";
import { getPublicEnv, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const NOT_CONFIGURED = errorState(
  "Sign-in is not available because this server has no Supabase configuration. See the README.",
);

const callbackUrl = (next: string, flow?: "verify") =>
  `${getPublicEnv().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}${flow ? `&flow=${flow}` : ""}`;

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = parseForm(signUpSchema, formData);
  if (!parsed.ok) return parsed.state;

  const { firstName, lastName, email, password } = parsed.data;
  const next = safeNextPath(formData.get("next"), "/onboarding");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName, last_name: lastName },
      // Verifying the address ends on the sign-in page with "Verification successful." (see /auth/callback).
      emailRedirectTo: callbackUrl(next, "verify"),
    },
  });

  if (error) {
    if (error.code === "weak_password") {
      return errorState("Please choose a stronger password.", {
        fieldErrors: { password: error.message },
        values: parsed.echo,
      });
    }
    return errorState("We could not create your account. Check your details and try again.", {
      values: parsed.echo,
    });
  }

  // With email confirmation off, Supabase returns a session straight away.
  if (data.session) redirect(next);
  // Otherwise (and for an already-registered address, which Supabase obscures
  // on purpose) show the same "check your email" page so accounts cannot be probed.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = parseForm(signInSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.code === "email_not_confirmed") {
      redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    }
    // One message for every failure, so it never reveals whether the email exists.
    return errorState("Incorrect email or password.", { values: parsed.echo });
  }

  redirect(safeNextPath(formData.get("next"), "/today"));
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function requestPasswordResetAction(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = parseForm(forgotPasswordSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: callbackUrl("/reset-password") });

  // Same answer whether or not the address has an account.
  return successState("If an account exists for that email, a reset link is on its way. It can take a few minutes.");
}

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  // The reset link signs the user in; without that session this does nothing.
  await requireUser();

  const parsed = parseForm(resetPasswordSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return errorState(
      error.code === "same_password" ? "Choose a different password from your current one." : "We could not update your password. Request a new reset link and try again.",
    );
  }
  redirect("/today");
}

export async function resendVerificationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return errorState("Enter the email address you signed up with.");

  const supabase = await createClient();
  await supabase.auth.resend({
    type: "signup",
    email: email.data,
    options: { emailRedirectTo: callbackUrl("/onboarding", "verify") },
  });
  return successState("If that address is waiting for verification, we have sent a new link.");
}
