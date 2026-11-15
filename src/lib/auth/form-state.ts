import type { ZodType } from "zod";

/** Result of a form submission, returned by server actions and read by forms. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values (never passwords) so the form can refill itself after an error. */
  values?: Record<string, string | string[]>;
  /** Extra output, for example a freshly created invitation link. */
  output?: string;
};

export const idleState: FormState = { status: "idle" };

export const errorState = (message: string, extra: Partial<FormState> = {}): FormState => ({
  status: "error",
  message,
  ...extra,
});

export const successState = (message: string, extra: Partial<FormState> = {}): FormState => ({
  status: "success",
  message,
  ...extra,
});

type Spec = {
  /** Field names that hold several values (checkbox groups). */
  arrays?: readonly string[];
  /** Field names that are single checkboxes and become booleans. */
  booleans?: readonly string[];
  /** Field names whose values must never be echoed back to the browser. */
  secret?: readonly string[];
};

export function readForm(formData: FormData, spec: Spec = {}) {
  const raw: Record<string, unknown> = {};
  const echo: Record<string, string | string[]> = {};
  const secret = new Set(spec.secret ?? ["password", "currentPassword", "newPassword", "confirmPassword"]);

  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    if (spec.arrays?.includes(key)) {
      const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
      raw[key] = all;
      echo[key] = all;
    } else if (spec.booleans?.includes(key)) {
      raw[key] = formData.get(key) === "on";
    } else {
      const value = formData.get(key);
      raw[key] = typeof value === "string" ? value : "";
      if (typeof value === "string" && !secret.has(key)) echo[key] = value;
    }
  }
  for (const key of spec.arrays ?? []) raw[key] ??= [];
  for (const key of spec.booleans ?? []) raw[key] ??= false;
  return { raw, echo };
}

/** Validates form data and returns either the parsed value or a ready-to-return error state. */
export function parseForm<T>(
  schema: ZodType<T>,
  formData: FormData,
  spec: Spec = {},
): { ok: true; data: T; echo: Record<string, string | string[]> } | { ok: false; state: FormState } {
  const { raw, echo } = readForm(formData, spec);
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data, echo };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return {
    ok: false,
    state: errorState("Please fix the highlighted fields.", { fieldErrors, values: echo }),
  };
}
