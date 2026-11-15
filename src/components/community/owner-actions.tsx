"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextAreaField, TextField } from "@/components/ui/form";
import { FormMessage, SubmitButton, stringValue } from "@/components/forms/shared";
import { idleState, type FormState } from "@/lib/auth/form-state";

type FormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * Edit and delete for a person's own contribution. Deleting asks first, and says what happens.
 * `hidden` carries the ids the action needs.
 */
export function OwnerActions({
  hidden,
  title,
  body,
  showTitle,
  editAction,
  deleteAction,
  maxLength,
  extraEditFields,
}: {
  hidden: Record<string, string>;
  title?: string | null;
  body: string;
  showTitle?: boolean;
  editAction: FormAction;
  deleteAction: (formData: FormData) => Promise<void>;
  maxLength: number;
  extraEditFields?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action] = useActionState(editAction, idleState);

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button variant="ghost" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
        {editing ? "Cancel edit" : "Edit"}
      </Button>
      <Button variant="ghost" onClick={() => setConfirming(true)}>Delete</Button>

      {editing ? (
        <form action={action} className="mt-2 grid w-full gap-3 rounded-control border border-line p-4">
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {showTitle ? <TextField name="title" label="Title (optional)" defaultValue={stringValue(state, "title", title ?? "")} maxLength={120} /> : null}
          <TextAreaField name="body" label="Edit" rows={5} maxLength={maxLength} required defaultValue={stringValue(state, "body", body)} error={state.fieldErrors?.body} />
          {extraEditFields}
          <FormMessage state={state} />
          <div className="flex gap-2"><SubmitButton>Save changes</SubmitButton></div>
        </form>
      ) : null}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete this?"
        description="It will be removed for everyone, including any replies attached to it. This cannot be undone."
        footer={
          <form action={deleteAction} className="flex w-full justify-end gap-2">
            {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <Button variant="ghost" onClick={() => setConfirming(false)}>Keep it</Button>
            <SubmitButton variant="danger">Delete</SubmitButton>
          </form>
        }
      />
    </div>
  );
}
