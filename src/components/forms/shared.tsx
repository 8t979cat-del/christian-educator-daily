"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import type { FormState } from "@/lib/auth/form-state";

/** Submit button that disables itself and shows a spinner while the form is submitting. */
export function SubmitButton({
  children,
  variant,
  fullWidth,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} fullWidth={fullWidth} loading={pending}>
      {children}
    </Button>
  );
}

/** Shows the result of the last submission. Field-level errors appear beside their fields instead. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <Alert tone={state.status === "success" ? "success" : "error"}>
      {state.message}
    </Alert>
  );
}

export const stringValue = (state: FormState, key: string, fallback = ""): string => {
  const value = state.values?.[key];
  return typeof value === "string" ? value : fallback;
};

export const listValue = (state: FormState, key: string, fallback: readonly string[] = []): readonly string[] => {
  const value = state.values?.[key];
  return Array.isArray(value) ? value : fallback;
};

/** Hidden field carrying the post-login destination. It is re-validated on the server. */
export function NextField({ next }: { next?: string }) {
  return next ? <input type="hidden" name="next" value={next} /> : null;
}
