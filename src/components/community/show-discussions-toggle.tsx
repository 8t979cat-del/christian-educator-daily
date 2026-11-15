"use client";

import { useState, useTransition } from "react";
import { setShowDiscussionsAction } from "@/app/actions/community";

/** Saves immediately. Reading, printing and classroom presentation never depend on this. */
export function ShowDiscussionsToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <label className="flex min-h-11 items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-brand"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            start(async () => {
              const r = await setShowDiscussionsAction(next);
              if (r.ok) { setOn(next); setError(false); } else setError(true);
            });
          }}
        />
        <span>
          <span className="font-medium">Show “Reflect Together” on devotionals</span>
          <span className="block text-sm text-muted">Turn this off to use devotionals privately, with no discussion on the page. You can still pray, read and present in class.</span>
        </span>
      </label>
      {error ? <p role="alert" className="text-sm text-danger">That could not be saved. Please try again.</p> : null}
    </div>
  );
}
