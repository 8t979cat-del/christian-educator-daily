"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import {
  acceptCovenantAction,
  adminDeleteGroupAction,
  adminSetGroupRoleAction,
  adminTransferGroupAction,
  closeEscalationAction,
  decideGroupRequestAction,
  escalateToAdminAction,
  runRetentionAction,
  saveContributorAction,
  schoolDeleteGroupAction,
  schoolTransferGroupAction,
  setAccountStatusAction,
  setCreditsAction,
  setDiscussionControlsAction,
  setGovernanceSettingAction,
  setPinnedQuestionAction,
  setThreadControlsAction,
} from "@/app/actions/governance";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { CheckboxField } from "@/components/ui/choices";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { idleState, type FormState } from "@/lib/auth/form-state";
import type { ButtonVariant } from "@/components/ui/button";

type Act = (prev: FormState, data: FormData) => Promise<FormState>;

/** One small form: hidden fields, its inputs, a message, and a submit button. */
function Mini({
  action, hidden, children, submit, variant, className,
}: {
  action: Act;
  hidden: Record<string, string>;
  children?: ReactNode;
  submit: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const [state, run] = useActionState(action, idleState);
  return (
    <form action={run} className={className ?? "grid gap-3"}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <FormMessage state={state} />
      <div><SubmitButton variant={variant}>{submit}</SubmitButton></div>
    </form>
  );
}

// --- Covenant ---------------------------------------------------------------------------------
export function CovenantAcceptForm({ version, accepted }: { version: number; accepted: boolean }) {
  const [state, run] = useActionState(acceptCovenantAction, idleState);
  if (accepted || state.status === "success") {
    return <p role="status" className="rounded-control bg-brand-soft p-4 font-medium">You have accepted the community covenant. Thank you.</p>;
  }
  return (
    <form action={run} className="grid gap-3 rounded-card border border-brand/30 bg-brand-soft p-5">
      <input type="hidden" name="version" value={version} />
      <p className="font-semibold">Before your first contribution</p>
      <p className="text-sm">Reading and discussion are open to you either way. To post, pray with others or write in a group, please confirm that you will keep this covenant.</p>
      <CheckboxField name="agree" label="I have read the community covenant and will keep it." />
      {state.fieldErrors?.agree ? <p className="text-sm font-medium text-danger">{state.fieldErrors.agree}</p> : null}
      <CheckboxField name="adult" label="I am an adult (18 or older). This community is for educators and other adults." />
      {state.fieldErrors?.adult ? <p className="text-sm font-medium text-danger">{state.fieldErrors.adult}</p> : null}
      <FormMessage state={state} />
      <div><SubmitButton>Accept the covenant</SubmitButton></div>
    </form>
  );
}

/** A short pointer shown where a composer would be, until the covenant is accepted. */
export function CovenantNeeded({ version }: { version: number }) {
  return (
    <div className="grid gap-3 rounded-control border border-brand/30 bg-brand-soft p-4">
      <p className="font-semibold">Please read and accept our community covenant before you contribute.</p>
      <p className="text-sm">It takes a minute, and you only do it once (again only if it changes).</p>
      <CovenantAcceptForm version={version} accepted={false} />
      <p className="text-sm"><Link className="text-brand underline" href="/community/covenant">Read the covenant first</Link></p>
    </div>
  );
}

// --- Discussion controls ---------------------------------------------------------------------
export function DiscussionModeForm({ devotionalId, mode, canPin }: { devotionalId: string; mode: "open" | "closed" | "disabled"; canPin: boolean }) {
  void canPin;
  return (
    <Mini action={setDiscussionControlsAction} hidden={{ devotionalId }} submit="Save discussion setting">
      <SelectField
        name="mode"
        label="Discussion"
        defaultValue={mode}
        options={[
          { value: "open", label: "Open: people can contribute" },
          { value: "closed", label: "Closed: readable, no new contributions" },
          { value: "disabled", label: "Off: hidden from readers" },
        ]}
        hint="Closing keeps the conversation readable. Turning it off hides it from everyone but moderators and each author."
      />
      <TextField name="note" label="Note for the record (optional)" maxLength={500} />
    </Mini>
  );
}

export function PinnedQuestionForm({ devotionalId, question }: { devotionalId: string; question: string }) {
  return (
    <Mini action={setPinnedQuestionAction} hidden={{ devotionalId }} submit="Save question">
      <TextAreaField
        name="question"
        label="Pinned discussion question"
        rows={3}
        maxLength={400}
        defaultValue={question}
        hint="Shown at the top of Reflect Together. Leave empty to remove it. Keep it open and Scripture-centered."
      />
    </Mini>
  );
}

export function ThreadControlsForm({ contributionId, repliesLocked, acksLocked, isPrayer }: { contributionId: string; repliesLocked: boolean; acksLocked: boolean; isPrayer: boolean }) {
  return (
    <Mini action={setThreadControlsAction} hidden={{ contributionId }} submit="Save" variant="secondary">
      <CheckboxField name="repliesLocked" defaultChecked={repliesLocked} label="Lock replies on this thread" />
      {isPrayer ? <CheckboxField name="acksLocked" defaultChecked={acksLocked} label="Stop new “I prayed” acknowledgements on this prayer" /> : null}
      <TextField name="reason" label="Reason (required when locking)" maxLength={500} />
    </Mini>
  );
}

// --- Groups -----------------------------------------------------------------------------------
export function DecideGroupForm({ groupId }: { groupId: string }) {
  return (
    <Mini action={decideGroupRequestAction} hidden={{ groupId }} submit="Record decision">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Decision</legend>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="decision" value="approve" defaultChecked className="size-4 accent-brand" /><span><strong>Approve.</strong> The owner can invite members and the group can appear in the directory if it is discoverable.</span></label>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="decision" value="reject" className="size-4 accent-brand" /><span><strong>Decline.</strong> Say why, so they can try again.</span></label>
      </fieldset>
      <TextAreaField name="reason" label="Reason (required to decline; the owner will read it)" rows={2} maxLength={500} />
    </Mini>
  );
}

export function AdminGroupTools({ groupId, members }: { groupId: string; members: Array<{ user_id: string; name: string | null; role: string }> }) {
  const options = members.filter((m) => m.role !== "owner").map((m) => ({ value: m.user_id, label: `${m.name ?? "Member"} (${m.role})` }));
  return (
    <div className="grid gap-5">
      <p className="text-sm text-muted">You can see who is in this group and what role each person has, nothing they have written. This look was recorded in the audit log.</p>
      <ul className="grid gap-1 text-sm">
        {members.map((m) => <li key={m.user_id}><strong>{m.name ?? "Member"}</strong> · {m.role}</li>)}
      </ul>
      {options.length > 0 ? (
        <>
          <Mini action={adminTransferGroupAction} hidden={{ groupId }} submit="Transfer ownership" variant="secondary">
            <SelectField name="newOwner" label="New owner" options={options} />
            <TextField name="reason" label="Reason (recorded)" required maxLength={500} />
          </Mini>
          <Mini action={adminSetGroupRoleAction} hidden={{ groupId }} submit="Change role" variant="secondary">
            <SelectField name="userId" label="Member" options={options} />
            <SelectField name="role" label="Role" options={[{ value: "moderator", label: "Group moderator" }, { value: "member", label: "Member" }]} />
            <TextField name="reason" label="Reason (recorded)" required maxLength={500} />
          </Mini>
        </>
      ) : null}
      <Mini action={adminDeleteGroupAction} hidden={{ groupId }} submit="Delete this group" variant="danger">
        <TextField name="reason" label="Reason (recorded)" required maxLength={500} />
        <CheckboxField name="confirm" label="I understand this permanently deletes the group and everything in it." />
      </Mini>
    </div>
  );
}

export function SchoolGroupTools({ schoolId, groupId, candidates }: { schoolId: string; groupId: string; candidates: Array<{ value: string; label: string }> }) {
  return (
    <div className="grid gap-4">
      {candidates.length > 0 ? (
        <Mini action={schoolTransferGroupAction} hidden={{ schoolId, groupId }} submit="Transfer ownership" variant="secondary">
          <SelectField name="newOwner" label="New owner (must belong to the school and the group)" options={candidates} />
        </Mini>
      ) : <p className="text-sm text-muted">Add another school member to the group to hand it over.</p>}
      <Mini action={schoolDeleteGroupAction} hidden={{ schoolId, groupId }} submit="Delete this group" variant="danger">
        <CheckboxField name="confirm" label="I understand this permanently deletes the group and everything in it." />
      </Mini>
    </div>
  );
}

// --- Escalation and accounts -----------------------------------------------------------------
export function EscalateForm({ reportId }: { reportId: string }) {
  return (
    <Mini action={escalateToAdminAction} hidden={{ reportId }} submit="Pass to a platform administrator" variant="secondary">
      <TextAreaField name="note" label="What needs a decision?" rows={3} required maxLength={500} hint="Use this for credible threats, risk of harm, or anything involving a child. Do not paste more of the content than needed." />
    </Mini>
  );
}

export function CloseEscalationForm({ reportId }: { reportId: string }) {
  return (
    <Mini action={closeEscalationAction} hidden={{ reportId }} submit="Record what was done">
      <TextAreaField name="note" label="What was done?" rows={3} required maxLength={500} />
    </Mini>
  );
}

export function AccountStatusForm({ userId }: { userId: string }) {
  return (
    <Mini action={setAccountStatusAction} hidden={{ userId }} submit="Apply" variant="danger">
      <SelectField
        name="status"
        label="Account"
        options={[
          { value: "suspended", label: "Suspend for a number of days" },
          { value: "terminated", label: "Terminate (close until an administrator restores it)" },
          { value: "active", label: "Restore the account" },
        ]}
      />
      <TextField name="days" type="number" min={1} max={365} defaultValue={14} label="Days (for a suspension)" />
      <TextAreaField name="reason" label="Reason (the person will read this and can appeal)" rows={3} required maxLength={500} />
      <CheckboxField name="confirm" label="I have reviewed the evidence and this is proportionate." />
    </Mini>
  );
}

// --- Settings, retention, contributors ------------------------------------------------------
export function SettingForm({ settingKey, label, value, help }: { settingKey: string; label: string; value: string; help?: string }) {
  return (
    <Mini action={setGovernanceSettingAction} hidden={{ key: settingKey }} submit="Save" variant="secondary" className="flex flex-wrap items-end gap-3">
      <TextField name="value" label={label} defaultValue={value} hint={help} className="w-32" />
    </Mini>
  );
}

export function RetentionForm() {
  const [state, run] = useActionState(runRetentionAction, idleState);
  return (
    <form action={run} className="grid gap-3">
      <FormMessage state={state} />
      {state.output ? <pre className="overflow-x-auto rounded-control bg-canvas p-3 text-sm">{state.output}</pre> : null}
      <div><SubmitButton variant="secondary">Run retention now</SubmitButton></div>
    </form>
  );
}

export function ContributorForm({ contributor }: { contributor?: { id: string; name: string; bio: string; active: boolean } }) {
  const [state, run] = useActionState(saveContributorAction, idleState);
  return (
    <form action={run} className="grid gap-3">
      <input type="hidden" name="id" value={contributor?.id ?? ""} />
      <TextField name="name" label="Name" defaultValue={contributor?.name ?? ""} required maxLength={120} error={state.fieldErrors?.name} />
      <TextAreaField name="bio" label="Short bio (shown with the devotional)" rows={2} maxLength={500} defaultValue={contributor?.bio ?? ""} error={state.fieldErrors?.bio} />
      <CheckboxField name="active" defaultChecked={contributor?.active ?? true} label="Available to credit on new devotionals" />
      <FormMessage state={state} />
      <div><SubmitButton variant={contributor ? "secondary" : "primary"}>{contributor ? "Save" : "Add contributor"}</SubmitButton></div>
    </form>
  );
}

export function CreditsForm({
  devotionalId, contributors, current,
}: {
  devotionalId: string;
  contributors: Array<{ id: string; name: string }>;
  current: Array<{ contributor_id: string; role: string }>;
}) {
  const [state, run] = useActionState(setCreditsAction, idleState);
  const has = (id: string, role: string) => current.some((c) => c.contributor_id === id && c.role === role);
  if (contributors.length === 0) return <p className="text-sm text-muted">Add contributors first, on the Contributors page.</p>;
  return (
    <form action={run} className="grid gap-4">
      <input type="hidden" name="devotionalId" value={devotionalId} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th className="py-2 pr-3">Person</th><th className="px-3">Author</th><th className="px-3">Contributor</th><th className="px-3">Reviewer</th></tr></thead>
          <tbody>
            {contributors.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <th scope="row" className="py-2 pr-3 font-medium">{c.name}</th>
                {(["author", "contributor", "reviewer"] as const).map((role) => (
                  <td key={role} className="px-3">
                    <input type="checkbox" name={`role_${role}`} value={c.id} defaultChecked={has(c.id, role)} aria-label={`${c.name} as ${role}`} className="size-5 accent-brand" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FormMessage state={state} />
      <div><SubmitButton variant="secondary">Save credits</SubmitButton></div>
    </form>
  );
}
