"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createReplyAction, deleteReplyAction, loadRepliesAction } from "@/app/actions/community";
import { Spinner } from "@/components/ui/feedback";
import { FormMessage, SubmitButton } from "@/components/forms/shared";
import { TextAreaField } from "@/components/ui/form";
import { ReportButton } from "./report-button";
import { idleState } from "@/lib/auth/form-state";
import type { Reply } from "@/lib/community/types";

/** Replies are optional and flat. They load when opened. */
export function ReplyThread({ contributionId, devotionalId, count, canReply }: { contributionId: string; devotionalId: string; count: number; canReply: boolean }) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [loading, startLoad] = useTransition();
  const [failed, setFailed] = useState(false);
  const [state, action] = useActionState(createReplyAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);

  const load = () =>
    startLoad(async () => {
      try {
        setReplies(await loadRepliesAction(contributionId));
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });

  useEffect(() => {
    if (open && replies === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const label = count === 1 ? "1 reply" : `${count} replies`;
  const panelId = `replies-${contributionId}`;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="min-h-11 rounded-control px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
      >
        {open ? "Hide replies" : canReply || count > 0 ? (count > 0 ? `Replies (${label})` : "Reply") : label}
      </button>
      <div id={panelId} hidden={!open} className="mt-2 grid gap-3 border-l-2 border-line pl-4">
        {loading && replies === null ? <Spinner label="Loading replies" /> : null}
        {failed ? <p role="alert" className="text-sm text-danger">Replies could not be loaded. Close and reopen to try again.</p> : null}
        {replies?.length === 0 && !loading ? <p className="text-sm text-muted">No replies yet.</p> : null}
        <ul className="grid gap-3">
          {replies?.map((r) => (
            <li key={r.id} className="rounded-control bg-canvas p-3">
              {r.moderation === "hidden" ? (
                <p className="text-sm text-muted">
                  A moderator hid this reply{r.moderation_reason ? `: ${r.moderation_reason}` : "."}
                </p>
              ) : null}
              <p className="text-sm text-muted">
                <span className="font-semibold text-ink">{r.author_name ?? "A member"}</span>
                {r.is_mine ? " (you)" : ""} · <time dateTime={r.created_at}>{new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
                {r.edited_at ? " · edited" : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
              <div className="mt-1 flex gap-1">
                {r.is_mine ? (
                  <form action={async (fd) => { await deleteReplyAction(fd); load(); }}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="devotionalId" value={devotionalId} />
                    <button type="submit" className="min-h-11 rounded-control px-3 text-sm text-muted hover:text-ink hover:underline">Delete</button>
                  </form>
                ) : (
                  <ReportButton targetType="reply" targetId={r.id} canBlock />
                )}
              </div>
            </li>
          ))}
        </ul>
        {canReply ? (
          <form ref={formRef} action={action} className="grid gap-2">
            <input type="hidden" name="contributionId" value={contributionId} />
            <input type="hidden" name="devotionalId" value={devotionalId} />
            <TextAreaField name="body" label="Write a reply" rows={3} maxLength={2000} required error={state.fieldErrors?.body} />
            <FormMessage state={state.status === "success" ? idleState : state} />
            <div><SubmitButton>Reply</SubmitButton></div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
