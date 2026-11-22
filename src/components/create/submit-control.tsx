"use client";

import { useState, useTransition } from "react";
import { submitDevotionalAction, withdrawSubmissionAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";

export type LatestSubmission = { id: string; status: "pending" | "accepted" | "declined" | "withdrawn"; editor_note: string } | null;

/** "Submit for publishing" on one of the teacher's saved devotionals, and where that submission stands. */
export function SubmitControl({ versionId, title, latest }: { versionId: string; title: string; latest: LatestSubmission }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error);
      else after?.();
    });
  };

  const status = latest?.status;
  return (
    <div className="grid gap-2">
      {status === "pending" ? (
        <p className="flex flex-wrap items-center gap-x-3 text-sm">
          <span className="font-semibold text-brand">Submitted for publishing · waiting for review</span>
          <button type="button" disabled={pending} onClick={() => run(() => withdrawSubmissionAction(latest!.id))} className="min-h-11 font-semibold text-muted underline underline-offset-4 hover:text-ink">
            Withdraw<span className="sr-only"> {title}</span>
          </button>
        </p>
      ) : status === "accepted" ? (
        <p className="text-sm font-semibold text-brand">Accepted. The editors are preparing it for publishing.</p>
      ) : open ? (
        <form
          className="grid max-w-[36rem] gap-2"
          onSubmit={(e) => { e.preventDefault(); run(() => submitDevotionalAction({ versionId, note }), () => { setOpen(false); setNote(""); }); }}
        >
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Note to the editors <span className="font-normal text-muted">(optional)</span></span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="For example, which grade it suits or a day it would fit."
              className="w-full rounded-control border border-line-strong/60 bg-surface px-3 py-2 leading-snug focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
          <p className="text-sm text-muted">The editors review it before anything is published, and may edit it. They see your name as the author.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit for publishing"}</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-1">
          {status === "declined" ? (
            <p className="text-sm">
              <span className="font-semibold text-danger">Not accepted this time.</span>
              {latest?.editor_note ? <span className="text-muted"> The editors said: “{latest.editor_note}”</span> : null}
            </p>
          ) : null}
          <p>
            <button type="button" onClick={() => setOpen(true)} className="min-h-11 font-semibold text-brand underline underline-offset-4">
              {status === "declined" ? "Submit again" : "Submit for publishing"}<span className="sr-only">: {title}</span>
            </button>
          </p>
        </div>
      )}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
