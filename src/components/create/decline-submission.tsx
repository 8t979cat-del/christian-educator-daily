"use client";

import { useState, useTransition } from "react";
import { declineSubmissionAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";

/** Editors: decline a submission with a note to the teacher. */
export function DeclineSubmission({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return <Button variant="secondary" onClick={() => setOpen(true)}>Decline<span className="sr-only">: {title}</span></Button>;
  }
  return (
    <form
      className="grid w-full max-w-[36rem] gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await declineSubmissionAction({ id, note });
          if (!result.ok) setError(result.error);
        });
      }}
    >
      <label className="grid gap-1">
        <span className="text-sm font-semibold">Note to the teacher <span className="font-normal text-muted">(they will see it)</span></span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className="w-full rounded-control border border-line-strong/60 bg-surface px-3 py-2 leading-snug focus-visible:outline-2 focus-visible:outline-brand" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Declining…" : "Decline submission"}</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
