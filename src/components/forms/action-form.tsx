"use client";

import { useActionState, type ReactNode } from "react";
import { idleState, type FormState } from "@/lib/auth/form-state";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import type { ButtonVariant } from "@/components/ui/button";

/** A small form for any server action that returns a FormState. Shows the result, and any one-time output (such as a new access code). */
export function ActionForm({
  action, submit, variant, children, className,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  submit: string;
  variant?: ButtonVariant;
  children?: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  return (
    <form action={formAction} className={className ?? "grid gap-3"}>
      {children}
      <FormMessage state={state} />
      {state.output ? (
        <p className="rounded-control border border-line-strong/60 bg-brand-soft p-3 font-mono text-lg tracking-wider" aria-live="polite">
          {state.output}
        </p>
      ) : null}
      <div><SubmitButton variant={variant}>{submit}</SubmitButton></div>
    </form>
  );
}
