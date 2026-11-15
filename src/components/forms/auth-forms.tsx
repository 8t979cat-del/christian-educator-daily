"use client";

import Link from "next/link";
import { useActionState } from "react";
import { TextField } from "@/components/ui/form";
import {
  requestPasswordResetAction,
  resendVerificationAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/app/actions/auth";
import { idleState } from "@/lib/auth/form-state";
import { FormMessage, NextField, stringValue, SubmitButton } from "./shared";

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, idleState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <NextField next={next} />
      <FormMessage state={state} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={stringValue(state, "email")}
        error={state.fieldErrors?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="flex min-h-11 items-center text-sm font-medium text-brand underline">
          Forgot your password?
        </Link>
      </div>
      <SubmitButton fullWidth>Sign in</SubmitButton>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUpAction, idleState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <NextField next={next} />
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          defaultValue={stringValue(state, "firstName")}
          error={state.fieldErrors?.firstName}
        />
        <TextField
          label="Last name"
          name="lastName"
          autoComplete="family-name"
          required
          defaultValue={stringValue(state, "lastName")}
          error={state.fieldErrors?.lastName}
        />
      </div>
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        hint="Use the address your school or colleagues know you by. School invitations are tied to it."
        defaultValue={stringValue(state, "email")}
        error={state.fieldErrors?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
        error={state.fieldErrors?.password}
      />
      <SubmitButton fullWidth>Create account</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, idleState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={stringValue(state, "email")}
        error={state.fieldErrors?.email}
      />
      <SubmitButton fullWidth>Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, idleState);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <FormMessage state={state} />
      <TextField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 10 characters, with a letter and a number."
        error={state.fieldErrors?.password}
      />
      <TextField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton fullWidth>Set new password</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm({ email }: { email?: string }) {
  const [state, action] = useActionState(resendVerificationAction, idleState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={stringValue(state, "email", email ?? "")}
        error={state.fieldErrors?.email}
      />
      <SubmitButton variant="secondary" fullWidth>
        Send a new verification link
      </SubmitButton>
    </form>
  );
}
