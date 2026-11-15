"use client";

import { useActionState } from "react";
import { addToCollectionAction, createCollectionAction, deleteCollectionAction, removeFromCollectionAction } from "@/app/actions/collections";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { SelectField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";

export function NewCollectionForm() {
  const [state, action] = useActionState(createCollectionAction, idleState);
  return (
    <form action={action} className="grid gap-3 sm:max-w-sm" noValidate>
      <FormMessage state={state} />
      <TextField label="New collection" name="name" required maxLength={80} error={state.fieldErrors?.name} placeholder="Advent, New teacher week, Chapel…" />
      <div><SubmitButton variant="secondary">Create</SubmitButton></div>
    </form>
  );
}

export function DeleteCollectionButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(deleteCollectionAction, idleState);
  return (
    <form action={action} className="inline-grid gap-1"><input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost"><span>Delete<span className="sr-only"> {name}</span></span></SubmitButton>
      {state.status === "error" ? <span role="alert" className="text-sm text-danger">{state.message}</span> : null}</form>
  );
}

export function RemoveItemButton({ collectionId, devotionalId, title }: { collectionId: string; devotionalId: string; title: string }) {
  const [state, action] = useActionState(removeFromCollectionAction, idleState);
  return (
    <form action={action} className="inline-grid gap-1"><input type="hidden" name="collectionId" value={collectionId} /><input type="hidden" name="devotionalId" value={devotionalId} />
      <SubmitButton variant="ghost"><span>Remove<span className="sr-only"> {title}</span></span></SubmitButton>
      {state.status === "error" ? <span role="alert" className="text-sm text-danger">{state.message}</span> : null}</form>
  );
}

export function AddToCollectionControl({ devotionalId, collections }: { devotionalId: string; collections: { id: string; name: string }[] }) {
  const [state, action] = useActionState(addToCollectionAction, idleState);
  if (collections.length === 0) return null;
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end print:hidden">
      <input type="hidden" name="devotionalId" value={devotionalId} />
      <SelectField label="Add to a collection" name="collectionId" options={collections.map((c) => ({ value: c.id, label: c.name }))} />
      <SubmitButton variant="secondary">Add</SubmitButton>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </form>
  );
}
