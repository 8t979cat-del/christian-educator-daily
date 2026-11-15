"use client";

import { useActionState } from "react";
import { createResourceAction, setResourceStatusAction } from "@/app/actions/resources";
import { FormMessage, SubmitButton, stringValue } from "@/components/forms/shared";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";
import { RESOURCE_KINDS } from "@/lib/billing/resource-text";

export function ResourceForm() {
  const [state, action] = useActionState(createResourceAction, idleState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Type" name="kind" defaultValue={stringValue(state, "kind", "educator_resource")} options={RESOURCE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          hint="The type decides which plan feature unlocks it." />
        <TextField label="Week of (optional)" name="weekOf" type="date" />
      </div>
      <TextField label="Title" name="title" required maxLength={200} defaultValue={stringValue(state, "title")} error={state.fieldErrors?.title} />
      <TextAreaField label="Summary (shown to everyone, even when locked)" name="summary" rows={2} maxLength={600} defaultValue={stringValue(state, "summary")} error={state.fieldErrors?.summary} />
      <TextAreaField label="Text" name="body" rows={10} required defaultValue={stringValue(state, "body")} error={state.fieldErrors?.body} hint="Separate paragraphs with a blank line." />
      <SelectField label="Status" name="status" options={[{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }]} />
      <div><SubmitButton>Save resource</SubmitButton></div>
    </form>
  );
}

export function StatusButton({ id, status, label }: { id: string; status: "draft" | "published" | "archived"; label: string }) {
  const [state, action] = useActionState(setResourceStatusAction, idleState);
  return (
    <form action={action} className="inline-grid gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="ghost">{label}</SubmitButton>
      {state.status === "error" ? <span role="alert" className="text-sm text-danger">{state.message}</span> : null}
    </form>
  );
}
