import { useId } from "react";
import type { ReactNode } from "react";

type Option = { value: string; label: string };

/** A single labelled checkbox with a 44px touch target. */
export function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  defaultChecked?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-5 shrink-0 accent-brand"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <label htmlFor={id} className="min-h-6 cursor-pointer">
        <span className="font-medium">{label}</span>
        {hint ? (
          <span id={`${id}-hint`} className="block text-sm text-muted">
            {hint}
          </span>
        ) : null}
      </label>
    </div>
  );
}

/** A group of checkboxes that submit as several values under one name. */
export function CheckboxGroup({
  legend,
  name,
  options,
  defaultValues = [],
  hint,
  error,
}: {
  legend: string;
  name: string;
  options: readonly Option[];
  defaultValues?: readonly string[];
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset aria-describedby={describedBy} aria-invalid={error ? true : undefined} className="min-w-0">
      <legend className="text-sm font-semibold">{legend}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <div key={option.value} className="flex min-h-11 items-center gap-3">
              <input
                id={optionId}
                type="checkbox"
                name={name}
                value={option.value}
                defaultChecked={defaultValues.includes(option.value)}
                className="size-5 shrink-0 accent-brand"
              />
              <label htmlFor={optionId} className="cursor-pointer">
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
