import Link from "next/link";
import { deleteGroupPostAction, updateGroupPostAction } from "@/app/actions/groups";
import { setGroupPostLockedAction } from "@/app/actions/governance";
import { Badge } from "@/components/ui/feedback";
import { formatWhen } from "@/lib/community/format";
import { GROUP_POST_LABELS } from "@/lib/community/covenant";
import type { GroupPost } from "@/lib/community/types";
import { CommentThread } from "./comment-thread";
import { OwnerActions } from "./owner-actions";
import { PrayButton } from "./pray-button";
import { LeaderControls } from "./leader-controls";
import { ReportButton } from "./report-button";

export function GroupPostCard({ post, groupId, timeZone, canWrite, isLeader = false, commentsLocked = false }: { post: GroupPost; groupId: string; timeZone: string; canWrite: boolean; isLeader?: boolean; commentsLocked?: boolean }) {
  const hidden = post.moderation === "hidden";
  return (
    <article aria-labelledby={`gp-${post.id}`} className={"grid gap-3 rounded-card border bg-surface p-5 " + (post.kind === "prayer" ? "border-line border-l-4 border-l-brand/40" : "border-line")}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge className={post.kind === "prayer" ? "bg-canvas text-ink ring-1 ring-line" : undefined}>{GROUP_POST_LABELS[post.kind]}</Badge>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{post.author_name}</span>{post.is_mine ? " (you)" : ""} · <time dateTime={post.created_at}>{formatWhen(post.created_at, timeZone)}</time>
          {post.edited_at ? " · edited" : ""}
        </p>
      </header>
      {hidden ? <p role="note" className="rounded-control bg-canvas p-3 text-sm">A group moderator hid this{post.moderation_reason ? `: ${post.moderation_reason}` : "."} Only you and the group's leaders can see it.</p> : null}
      {post.title ? <h4 id={`gp-${post.id}`} className="font-serif text-lg font-semibold">{post.title}</h4> : <span id={`gp-${post.id}`} className="sr-only">{GROUP_POST_LABELS[post.kind]} by {post.author_name}</span>}
      <p className="whitespace-pre-wrap leading-relaxed">{post.body}</p>
      {post.scripture_reference || post.devotional_title ? (
        <p className="text-sm text-muted">
          {post.scripture_reference ? <>Scripture: <span className="font-medium text-ink">{post.scripture_reference}</span></> : null}
          {post.scripture_reference && post.devotional_title ? " · " : null}
          {post.devotional_id && post.devotional_title ? <>Devotional: <Link className="text-brand underline" href={`/devotional/${post.devotional_id}`}>{post.devotional_title}</Link></> : null}
        </p>
      ) : null}
      {post.kind === "prayer" && !hidden ? <PrayButton groupPostId={post.id} count={post.prayer_count} prayed={post.i_prayed} mine={post.is_mine} /> : null}
      <div className="flex flex-wrap items-center gap-1">
        {!hidden ? <CommentThread groupId={groupId} postId={post.id} count={post.comment_count} canWrite={canWrite && !commentsLocked} /> : null}
        {commentsLocked ? <Badge className="bg-canvas text-muted ring-1 ring-line">Comments locked</Badge> : null}
        {isLeader && !hidden ? (
          <form action={setGroupPostLockedAction}>
            <input type="hidden" name="postId" value={post.id} /><input type="hidden" name="groupId" value={groupId} /><input type="hidden" name="locked" value={commentsLocked ? "false" : "true"} />
            <button type="submit" className="min-h-11 rounded-control px-3 text-sm text-muted underline-offset-2 hover:text-ink hover:underline">{commentsLocked ? "Unlock comments" : "Lock comments"}</button>
          </form>
        ) : null}
        {post.is_mine ? (
          <OwnerActions hidden={{ id: post.id, groupId }} title={post.title} body={post.body} showTitle editAction={updateGroupPostAction} deleteAction={deleteGroupPostAction} maxLength={5000} />
        ) : (
          <>
            <ReportButton targetType="group_post" targetId={post.id} canBlock />
            {isLeader ? <LeaderControls type="group_post" id={post.id} hidden={hidden} /> : null}
          </>
        )}
      </div>
    </article>
  );
}
