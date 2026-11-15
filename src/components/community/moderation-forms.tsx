"use client";

import { useActionState } from "react";
import {
  fileAppealAction,
  resolveAppealAction,
  resolveReportAction,
  restrictUserAction,
  suspendGroupAction,
} from "@/app/actions/moderation";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";

export function ResolveReportForm({ reportId, canHide = true }: { reportId: string; canHide?: boolean }) {
  const [state, action] = useActionState(resolveReportAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="reportId" value={reportId} />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Decision</legend>
        <label className="flex min-h-11 items-start gap-3"><input type="radio" name="decision" value="dismiss" defaultChecked className="mt-1 size-4 accent-brand" /><span><strong>Dismiss.</strong> No violation. Disagreement and hard questions are not violations.</span></label>
        {canHide ? <label className="flex min-h-11 items-start gap-3"><input type="radio" name="decision" value="hide" className="mt-1 size-4 accent-brand" /><span><strong>Hide it.</strong> Reversible. The author sees your reason and can appeal.</span></label> : null}
        <label className="flex min-h-11 items-start gap-3"><input type="radio" name="decision" value="warn" className="mt-1 size-4 accent-brand" /><span><strong>Send a warning.</strong> Leaves the content, records a note the author can read.</span></label>
      </fieldset>
      <TextAreaField name="note" label="Note (required to hide or warn; the author will read it)" rows={3} maxLength={1000} error={state.fieldErrors?.note} />
      <FormMessage state={state} />
      <div><SubmitButton>Record decision</SubmitButton></div>
    </form>
  );
}

export function RestrictForm({ reportId, userId }: { reportId: string; userId: string }) {
  const [state, action] = useActionState(restrictUserAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="userId" value={userId} />
      <SelectField name="kind" label="Restriction" options={[{ value: "suspension", label: "Pause community access for a time" }, { value: "ban", label: "Remove community access until lifted" }]} />
      <TextField name="days" type="number" min={1} max={365} defaultValue={7} label="Days (for a pause)" />
      <TextAreaField name="reason" label="Reason (the person will read this)" rows={3} maxLength={1000} required error={state.fieldErrors?.reason} />
      <FormMessage state={state} />
      <div><SubmitButton variant="danger">Apply restriction</SubmitButton></div>
    </form>
  );
}

export function AppealForm({ actionId }: { actionId: string }) {
  const [state, action] = useActionState(fileAppealAction, idleState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="actionId" value={actionId} />
      <TextAreaField name="message" label="Why should this be reconsidered?" rows={4} maxLength={1500} required error={state.fieldErrors?.message} />
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">Send appeal</SubmitButton></div>
    </form>
  );
}

export function ResolveAppealForm({ appealId }: { appealId: string }) {
  const [state, action] = useActionState(resolveAppealAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="appealId" value={appealId} />
      <SelectField name="decision" label="Decision" options={[{ value: "overturn", label: "Overturn: restore what was done" }, { value: "uphold", label: "Uphold: the original decision stands" }]} />
      <TextAreaField name="note" label="Explanation (the person will read this)" rows={3} maxLength={1000} required error={state.fieldErrors?.note} />
      <FormMessage state={state} />
      <div><SubmitButton>Record decision</SubmitButton></div>
    </form>
  );
}

export function SuspendGroupForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState(suspendGroupAction, idleState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="groupId" value={groupId} />
      <TextAreaField name="reason" label="Reason (members will read this)" rows={3} maxLength={1000} required error={state.fieldErrors?.reason} />
      <FormMessage state={state} />
      <div><SubmitButton variant="danger">Suspend this group</SubmitButton></div>
    </form>
  );
}
