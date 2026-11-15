"use client";

import { useActionState, useState } from "react";
import { blockAuthorAction, reportContentAction } from "@/app/actions/community";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { TextAreaField } from "@/components/ui/form";
import { DISAGREEMENT_NOTE, REPORT_REASONS } from "@/lib/community/covenant";
import { idleState } from "@/lib/auth/form-state";
import type { ReportTarget } from "@/lib/community/types";

type Target = Exclude<ReportTarget, "direct_message">;

/** Report (and, optionally, quietly block the author) from a small dialog. */
export function ReportButton({ targetType, targetId, canBlock }: { targetType: Target; targetId: string; canBlock: boolean }) {
  const [open, setOpen] = useState(false);
  const [reportState, report] = useActionState(reportContentAction, idleState);
  const [blockState, block] = useActionState(blockAuthorAction, idleState);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-control px-3 text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        Report or block
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report or block" description={DISAGREEMENT_NOTE}>
        {reportState.status === "success" ? (
          <FormMessage state={reportState} />
        ) : (
          <form action={report} className="grid gap-4">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-semibold">What is the concern?</legend>
              {REPORT_REASONS.map((r, i) => (
                <label key={r.value} className="flex min-h-11 items-start gap-3 rounded-control border border-line p-3">
                  <input type="radio" name="reason" value={r.value} required defaultChecked={i === 0 ? false : undefined} className="mt-1 size-4 accent-brand" />
                  <span>
                    <span className="font-medium">{r.label}</span>
                    {r.help ? <span className="block text-sm text-muted">{r.help}</span> : null}
                  </span>
                </label>
              ))}
            </fieldset>
            <TextAreaField name="details" label="Anything we should know? (optional)" rows={3} maxLength={1000} />
            <div className="grid gap-1 rounded-control border border-danger/40 p-3">
              <label className="flex min-h-11 items-start gap-3">
                <input type="checkbox" name="urgent" className="mt-1 size-5 accent-brand" />
                <span className="font-medium">This is an urgent safety concern (a threat, or someone who may be at risk).</span>
              </label>
              <p className="text-sm text-muted">Urgent reports go to the top of the platform team&apos;s queue, even from a private group. People read the queue during working hours; it is not a 24-hour service. If someone is in immediate danger, contact local emergency services first.</p>
            </div>
            <FormMessage state={reportState} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <SubmitButton>Send report</SubmitButton>
            </div>
          </form>
        )}
        {canBlock ? (
          <form action={block} className="mt-6 grid gap-2 border-t border-line pt-4">
            <input type="hidden" name="targetType" value={targetType} />
            <input type="hidden" name="targetId" value={targetId} />
            <p className="text-sm text-muted">Blocking hides this person&apos;s contributions from you. They are not told. You can undo it in Community notices.</p>
            <FormMessage state={blockState} />
            <div><SubmitButton variant="secondary">Block this person</SubmitButton></div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}
