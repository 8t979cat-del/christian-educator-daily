"use client";

import { useActionState } from "react";
import { transitionDevotionalAction } from "@/app/actions/content";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/form";
import { idleState } from "@/lib/auth/form-state";
import type { DevotionalStatus } from "@/lib/content/options";
import { actionsFor } from "@/lib/content/workflow";
import { FormMessage } from "./shared";

/**
 * Buttons for the steps the current status allows. This only decides what to
 * offer: the database function re-checks role, step, completeness and licence.
 */
export function WorkflowPanel({
  id,
  status,
  missing,
  blockedOwnApproval,
  timeZone,
  defaultPublishLocal,
}: {
  id: string;
  status: DevotionalStatus;
  missing: string[];
  /** The viewer wrote this and is not a platform administrator. */
  blockedOwnApproval: boolean;
  timeZone: string;
  defaultPublishLocal: string;
}) {
  const [state, action] = useActionState(transitionDevotionalAction, idleState);
  const actions = actionsFor(status);
  const needsComplete = (to: DevotionalStatus) => ["in_review", "approved", "scheduled", "published"].includes(to);
  const hasSchedule = actions.some((a) => a.needsTime);

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="id" value={id} />
      <FormMessage state={state} />

      {missing.length > 0 && (status === "draft" || status === "approved" || status === "in_review") ? (
        <div className="rounded-control bg-[#fdf0cf] p-3 text-sm text-[#5a3a00]">
          <p className="font-semibold">Still needed before it can move on:</p>
          <p>{missing.join(", ")}.</p>
        </div>
      ) : null}

      {hasSchedule ? (
        <TextField
          label={`Publish at (${timeZone})`}
          name="publishLocal"
          type="datetime-local"
          defaultValue={defaultPublishLocal}
          hint="Used by Schedule. It goes live at this time."
        />
      ) : null}

      {actions.length > 0 ? (
        <TextAreaField label={status === "published" ? "Reason (required to unpublish)" : "Note (optional)"} name="note" rows={2} maxLength={500} hint="Kept in the history. Use it to tell the author what to change." />
      ) : null}

      <ul className="grid gap-3">
        {actions.map((a) => {
          const ownApproval = a.to === "approved" && status === "in_review" && blockedOwnApproval;
          const incomplete = status !== "published" && needsComplete(a.to) && missing.length > 0;
          const disabled = ownApproval || incomplete;
          return (
            <li key={a.to} className="grid gap-1">
              <Button
                type="submit"
                name="to"
                value={a.to}
                variant={a.tone === "danger" ? "danger" : a.tone === "primary" ? "primary" : "secondary"}
                disabled={disabled}
                fullWidth
              >
                {a.label}
              </Button>
              <p className="text-sm text-muted">
                {ownApproval ? "You wrote this, so another editor must approve it." : incomplete ? "Complete the missing fields first." : a.help}
              </p>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
