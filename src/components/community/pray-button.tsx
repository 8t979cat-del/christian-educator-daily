"use client";

import { useState, useTransition } from "react";
import { setPrayedAction } from "@/app/actions/community";
import { pluralPrayers } from "@/lib/community/format";

/**
 * "I prayed for this." A quiet acknowledgement, not a like: it shows a plain count for this
 * one prayer, never a ranking, and nobody (including the author) is told who prayed.
 */
export function PrayButton({
  contributionId,
  groupPostId,
  count,
  prayed,
  mine,
  locked = false,
}: {
  contributionId?: string;
  groupPostId?: string;
  count: number;
  prayed: boolean;
  mine: boolean;
  /** New acknowledgements are stopped on this prayer (or the discussion is off or closed to new activity). */
  locked?: boolean;
}) {
  const [state, setState] = useState({ count, prayed });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      setError(null);
      const next = !state.prayed;
      const result = await setPrayedAction({ contributionId, groupPostId }, next);
      if (result.ok) setState({ count: result.count, prayed: result.prayed });
      else setError(result.error);
    });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {mine || (locked && !state.prayed) ? null : (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-pressed={state.prayed}
          className={
            "min-h-11 rounded-control border px-4 text-sm font-semibold transition-colors disabled:opacity-60 " +
            (state.prayed ? "border-brand bg-brand-soft text-brand" : "border-line-strong/60 bg-surface hover:bg-brand-soft")
          }
        >
          {state.prayed ? "You prayed for this" : "I prayed for this"}
        </button>
      )}
      {state.count > 0 ? <p className="text-sm text-muted" aria-live="polite">{pluralPrayers(state.count)}</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
