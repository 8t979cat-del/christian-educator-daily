import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full min-h-11 rounded-control border bg-surface px-3 py-2 text-base text-ink placeholder:text-muted/70 " +
  "disabled:cursor-not-allowed disabled:bg-line/40";

type FieldChrome = {
  label: string;
  hint?: string;
  error?: string;
};

type RenderControl = (aria: {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  className: string;
}) => ReactNode;

/** Label, hint and error message wired to a control with the right ARIA attributes. */
function Field({ label, hint, error, children, required }: FieldChrome & { children: RenderControl; required?: boolean }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        className: cn(CONTROL, error ? "border-danger" : "border-line-strong/60"),
      })}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<ComponentProps<"input">, "id"> & FieldChrome;

export function TextField({ label, hint, error, className, required, ...props }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(aria) => <input {...aria} required={required} className={cn(aria.className, className)} {...props} />}
    </Field>
  );
}

type TextAreaProps = Omit<ComponentProps<"textarea">, "id"> & FieldChrome;

export function TextAreaField({ label, hint, error, className, required, rows = 4, ...props }: TextAreaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(aria) => (
        <textarea {...aria} rows={rows} required={required} className={cn(aria.className, className)} {...props} />
      )}
    </Field>
  );
}

type SelectProps = Omit<ComponentProps<"select">, "id"> &
  FieldChrome & { options: ReadonlyArray<{ value: string; label: string }> };

export function SelectField({ label, hint, error, options, className, required, ...props }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(aria) => (
        <select {...aria} required={required} className={cn(aria.className, className)} {...props}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
