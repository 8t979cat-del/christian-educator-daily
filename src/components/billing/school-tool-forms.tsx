"use client";

import { useActionState } from "react";
import {
  addToSchoolCollectionAction, createAssignmentAction, createSchoolCollectionAction, deleteAssignmentAction, deleteSchoolCollectionAction,
} from "@/app/actions/school-tools";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { SelectField, TextAreaField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";

type Devotional = { id: string; title: string; devotional_date: string };
const label = (d: Devotional) => `${d.devotional_date} — ${d.title}`;

export function AssignmentForm({ schoolId, devotionals }: { schoolId: string; devotionals: Devotional[] }) {
  const [state, action] = useActionState(createAssignmentAction, idleState);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="schoolId" value={schoolId} />
      <FormMessage state={state} />
      <SelectField label="Devotional" name="devotionalId" required options={devotionals.map((d) => ({ value: d.id, label: label(d) }))} />
      <TextAreaField label="Note for the faculty (optional)" name="note" rows={2} maxLength={500} hint="For example: “Read before Thursday’s staff meeting.”" error={state.fieldErrors?.note} />
      <TextField label="Due date (optional)" name="dueDate" type="date" />
      <div><SubmitButton>Assign to faculty</SubmitButton></div>
    </form>
  );
}

export function RemoveButton({ kind, schoolId, id, name }: { kind: "assignment" | "collection"; schoolId: string; id: string; name: string }) {
  const [state, action] = useActionState(kind === "assignment" ? deleteAssignmentAction : deleteSchoolCollectionAction, idleState);
  return (
    <form action={action} className="inline-grid gap-1">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost"><span>Remove<span className="sr-only"> {name}</span></span></SubmitButton>
      {state.status === "error" ? <span role="alert" className="text-sm text-danger">{state.message}</span> : null}
    </form>
  );
}

export function CollectionForm({ schoolId }: { schoolId: string }) {
  const [state, action] = useActionState(createSchoolCollectionAction, idleState);
  return (
    <form action={action} className="grid gap-4 sm:max-w-md" noValidate>
      <input type="hidden" name="schoolId" value={schoolId} />
      <FormMessage state={state} />
      <TextField label="Collection name" name="name" required maxLength={80} error={state.fieldErrors?.name} />
      <TextField label="Description (optional)" name="description" maxLength={500} />
      <div><SubmitButton variant="secondary">Create collection</SubmitButton></div>
    </form>
  );
}

export function AddToCollectionForm({ schoolId, collectionId, devotionals }: { schoolId: string; collectionId: string; devotionals: Devotional[] }) {
  const [state, action] = useActionState(addToSchoolCollectionAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="schoolId" value={schoolId} />
      <input type="hidden" name="collectionId" value={collectionId} />
      <SelectField label="Add a devotional" name="devotionalId" options={devotionals.map((d) => ({ value: d.id, label: label(d) }))} />
      <SubmitButton variant="secondary">Add</SubmitButton>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </form>
  );
}
