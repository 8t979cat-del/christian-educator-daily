"use client";

import { useActionState, useState } from "react";
import { hideContentAction, restoreContentAction } from "@/app/actions/moderation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextAreaField } from "@/components/ui/form";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { idleState } from "@/lib/auth/form-state";

/** Hide or restore, for people with authority over this content. The author is told the reason. */
export function LeaderControls({ type, id, hidden }: { type: "contribution" | "reply" | "group_post" | "group_comment"; id: string; hidden: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(hideContentAction, idleState);

  if (hidden) {
    return (
      <form action={restoreContentAction}>
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="min-h-11 rounded-control px-3 text-sm font-semibold text-brand hover:bg-brand-soft">Restore</button>
      </form>
    );
  }
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>Hide…</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Hide this?" description="It is hidden from everyone but its author, who will see your reason and can appeal. Nothing is deleted, and you can restore it.">
        <form action={action} className="grid gap-3">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="id" value={id} />
          <TextAreaField name="reason" label="Why is it being hidden?" rows={3} maxLength={1000} required hint="Be specific and kind. Respectful disagreement is not a reason." />
          <FormMessage state={state} />
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><SubmitButton>Hide</SubmitButton></div>
        </form>
      </Modal>
    </>
  );
}
