"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createContributionAction } from "@/app/actions/community";
import { FormMessage, SubmitButton, stringValue } from "@/components/forms/shared";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { Alert } from "@/components/ui/feedback";
import { CONTRIBUTION_KINDS, KIND_LABELS, PRAYER_REMINDER } from "@/lib/community/covenant";
import { idleState } from "@/lib/auth/form-state";
import type { ContributionKind } from "@/lib/community/types";

/**
 * A simple composer with labelled types. Prayers get a reminder that must be acknowledged
 * before sharing, and optional name and visibility choices. There is no way to compose
 * anything that is not attached to this devotional.
 */
export function Composer({ devotionalId }: { devotionalId: string }) {
  const [state, action] = useActionState(createContributionAction, idleState);
  const [kind, setKind] = useState<ContributionKind>((stringValue(state, "kind", "reflection") as ContributionKind) || "reflection");
  const [visibility, setVisibility] = useState("named");
  const [length, setLength] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setLength(0);
      setVisibility("named");
    }
  }, [state]);

  const needsReminder = kind === "prayer" && visibility !== "private";
  const meta = KIND_LABELS[kind];

  return (
    <form ref={formRef} action={action} className="grid gap-4 rounded-card border border-line bg-surface p-5" aria-labelledby="composer-title">
      <h3 id="composer-title" className="font-serif text-xl font-normal">Add to the conversation</h3>
      <input type="hidden" name="devotionalId" value={devotionalId} />

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">What would you like to share?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup">
          {CONTRIBUTION_KINDS.map((k) => (
            <label
              key={k}
              className={
                "flex min-h-11 cursor-pointer items-center rounded-control border px-4 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand " +
                (kind === k ? "border-brand bg-brand-soft text-brand" : "border-line-strong/60 hover:bg-brand-soft")
              }
            >
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {KIND_LABELS[k].label}
            </label>
          ))}
        </div>
      </fieldset>

      {kind === "prayer" ? <TextField name="title" label="Title (optional)" maxLength={120} defaultValue={stringValue(state, "title")} error={state.fieldErrors?.title} /> : null}

      <TextAreaField
        name="body"
        label={meta.prompt}
        hint={meta.hint}
        rows={5}
        maxLength={4000}
        required
        defaultValue={stringValue(state, "body")}
        error={state.fieldErrors?.body}
        onChange={(e) => setLength(e.currentTarget.value.length)}
      />
      <p className="-mt-2 text-right text-xs text-muted" aria-live="off">{length.toLocaleString()} / 4,000</p>

      {kind === "prayer" ? (
        <SelectField
          name="visibility"
          label="Who can see this prayer?"
          value={visibility}
          onChange={(e) => setVisibility(e.currentTarget.value)}
          options={[
            { value: "named", label: "Everyone reading this devotional, with my name" },
            { value: "anonymous", label: "Everyone reading this devotional, without my name" },
            { value: "private", label: "Only me (a private prayer)" },
          ]}
          hint="An anonymous prayer cannot be traced to you by other people. Only you can edit or remove it."
        />
      ) : null}

      {needsReminder ? (
        <div ref={confirmRef} className="grid gap-3 rounded-control border border-brand/30 bg-brand-soft p-4">
          <p className="text-sm leading-relaxed">{PRAYER_REMINDER}</p>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" name="reminderAcknowledged" required className="mt-1 size-5 accent-brand" />
            <span className="font-medium">I have read this reminder.</span>
          </label>
          {state.fieldErrors?.reminderAcknowledged ? <p className="text-sm font-medium text-danger">{state.fieldErrors.reminderAcknowledged}</p> : null}
        </div>
      ) : null}

      <p className="text-sm text-muted">
        Please keep students, families and colleagues unnamed and unidentifiable, and leave out emails, phone numbers and links.
      </p>

      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : <FormMessage state={state} />}
      <div><SubmitButton>{kind === "prayer" ? "Share this prayer" : "Share"}</SubmitButton></div>
    </form>
  );
}
