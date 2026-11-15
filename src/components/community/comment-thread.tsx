"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteGroupCommentAction, loadGroupCommentsAction } from "@/app/actions/groups";
import { Spinner } from "@/components/ui/feedback";
import { CommentForm } from "./group-forms";
import { ReportButton } from "./report-button";
import type { GroupComment } from "@/lib/community/types";

export function CommentThread({ groupId, postId, count, canWrite }: { groupId: string; postId: string; count: number; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<GroupComment[] | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const load = () =>
    start(async () => {
      try {
        setItems(await loadGroupCommentsAction(postId));
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });

  useEffect(() => {
    if (open && items === null) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const top = (items ?? []).filter((c) => !c.parent_id);
  const kids = (id: string) => (items ?? []).filter((c) => c.parent_id === id);
  const panel = `comments-${postId}`;

  const one = (c: GroupComment, nested: boolean) => (
    <li key={c.id} className={"rounded-control bg-canvas p-3 " + (nested ? "ml-5" : "")}>
      {c.moderation === "hidden" ? <p className="text-sm text-muted">Hidden by a group moderator{c.moderation_reason ? `: ${c.moderation_reason}` : "."}</p> : null}
      <p className="text-sm text-muted">
        <span className="font-semibold text-ink">{c.author_name}</span>{c.is_mine ? " (you)" : ""} ·{" "}
        <time dateTime={c.created_at}>{new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
        {c.edited_at ? " · edited" : ""}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {canWrite && !nested ? (
          <button type="button" onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} aria-expanded={replyTo === c.id} className="min-h-11 rounded-control px-3 text-sm font-semibold text-brand hover:bg-brand-soft">Reply</button>
        ) : null}
        {c.is_mine ? (
          <form action={async (fd) => { await deleteGroupCommentAction(fd); load(); }}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="groupId" value={groupId} />
            <button type="submit" className="min-h-11 rounded-control px-3 text-sm text-muted hover:text-ink hover:underline">Delete</button>
          </form>
        ) : <ReportButton targetType="group_comment" targetId={c.id} canBlock />}
      </div>
      {replyTo === c.id ? <div className="mt-2"><CommentForm groupId={groupId} postId={postId} parentId={c.id} onDone={() => { setReplyTo(null); load(); }} /></div> : null}
    </li>
  );

  return (
    <div className="w-full">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panel} className="min-h-11 rounded-control px-3 text-sm font-semibold text-brand hover:bg-brand-soft">
        {open ? "Hide comments" : count > 0 ? `Comments (${count})` : canWrite ? "Comment" : "No comments"}
      </button>
      <div id={panel} hidden={!open} className="mt-2 grid gap-3 border-l-2 border-line pl-4">
        {loading && items === null ? <Spinner label="Loading comments" /> : null}
        {failed ? <p role="alert" className="text-sm text-danger">Comments could not be loaded. Close and reopen to try again.</p> : null}
        <ul className="grid gap-3">
          {top.map((c) => (
            <li key={c.id}>
              <ul className="grid gap-2">
                {one(c, false)}
                {kids(c.id).map((k) => one(k, true))}
              </ul>
            </li>
          ))}
        </ul>
        {canWrite ? <CommentForm groupId={groupId} postId={postId} onDone={load} /> : null}
      </div>
    </div>
  );
}
