"use client";

import { useActionState } from "react";
import { saveTranslationAction } from "@/app/actions/content";
import { CheckboxField } from "@/components/ui/choices";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";
import { FormMessage, stringValue, SubmitButton } from "./shared";

type Values = {
  code?: string;
  name?: string;
  license_type?: string;
  text_allowed?: boolean;
  attribution?: string | null;
  license_notes?: string | null;
};

export function TranslationForm({ initial }: { initial?: Values }) {
  const creating = !initial?.code;
  const [state, action] = useActionState(saveTranslationAction, idleState);
  const fe = state.fieldErrors ?? {};
  const v = (key: string, fallback: string | null | undefined) => stringValue(state, key, fallback ?? "");

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="mode" value={creating ? "create" : "update"} />
      {!creating ? <input type="hidden" name="code" value={initial?.code} /> : null}
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr_14rem]">
        {creating ? (
          <TextField label="Code" name="code" required defaultValue={v("code", "")} error={fe.code} hint="e.g. ampc" maxLength={10} />
        ) : (
          <TextField label="Code" value={initial?.code?.toUpperCase()} readOnly />
        )}
        <TextField label="Name" name="name" required defaultValue={v("name", initial?.name)} error={fe.name} />
        <SelectField
          label="Licence type"
          name="licenseType"
          defaultValue={v("licenseType", initial?.license_type ?? "reference_only")}
          options={[
            { value: "public_domain", label: "Public domain" },
            { value: "licensed", label: "Licensed" },
            { value: "reference_only", label: "Reference only" },
          ]}
        />
      </div>
      <CheckboxField
        name="textAllowed"
        label="Text may be stored and shown"
        defaultChecked={state.values ? state.values.textAllowed === "on" : Boolean(initial?.text_allowed)}
        hint={fe.textAllowed ?? "Turning this off immediately removes stored text for this translation."}
      />
      <TextField
        label="Attribution shown with the text"
        name="attribution"
        defaultValue={v("attribution", initial?.attribution)}
        error={fe.attribution}
        hint="Required for licensed text. Use the wording your licence specifies."
      />
      <TextAreaField
        label="Licence notes"
        name="licenseNotes"
        rows={2}
        defaultValue={v("licenseNotes", initial?.license_notes)}
        error={fe.licenseNotes}
        hint="Who granted it, the agreement, any limits on quotation. For your records."
      />
      <div>
        <SubmitButton>{creating ? "Add translation" : "Save licence record"}</SubmitButton>
      </div>
    </form>
  );
}
