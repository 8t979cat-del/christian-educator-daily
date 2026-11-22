import { deleteContributionAction, updateContributionAction } from "@/app/actions/community";
import { Badge } from "@/components/ui/feedback";
import { formatWhen } from "@/lib/community/format";
import { KIND_LABELS } from "@/lib/community/covenant";
import type { Contribution } from "@/lib/community/types";
import { ThreadControlsForm } from "@/components/governance/forms";
import { LeaderControls } from "./leader-controls";
import { OwnerActions } from "./owner-actions";
import { PrayButton } from "./pray-button";
import { ReplyThread } from "./reply-thread";
import { ReportButton } from "./report-button";

/**
 * One contribution. Prayers are visually restrained (a quiet left rule, no colour fills),
 * and there are no reaction counts anywhere except the plain "people have prayed" line.
 */
export function ContributionCard({ item, devotionalId, timeZone, canInteract, isModerator = false, repliesLocked = false, acksLocked = false }: { item: Contribution; devotionalId: string; timeZone: string; canInteract: boolean; isModerator?: boolean; repliesLocked?: boolean; acksLocked?: boolean }) {
  const meta = KIND_LABELS[item.kind];
  const hidden = item.moderation === "hidden";
  const author = item.visibility === "anonymous" && !item.is_mine ? "Shared anonymously" : item.author_name ?? "A member";

  return (
    <article
      aria-labelledby={`c-${item.id}`}
      className={
        "grid gap-3 rounded-card border bg-surface p-5 " +
        (item.kind === "prayer" ? "border-line border-l-4 border-l-brand/40" : "border-line")
      }
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge className={item.kind === "prayer" ? "bg-canvas text-ink ring-1 ring-line" : undefined}>{meta.label}</Badge>
        {item.visibility === "private" ? <Badge className="bg-canvas text-muted ring-1 ring-line">Only you can see this</Badge> : null}
        {item.visibility === "anonymous" && item.is_mine ? <Badge className="bg-canvas text-muted ring-1 ring-line">Shared without your name</Badge> : null}
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{author}</span>
          {item.is_mine ? " (you)" : ""} · <time dateTime={item.created_at}>{formatWhen(item.created_at, timeZone)}</time>
          {item.edited_at ? " · edited" : ""}
        </p>
      </header>

      {hidden ? (
        <p role="note" className="rounded-control bg-canvas p-3 text-sm">
          A moderator hid this{item.moderation_reason ? `: ${item.moderation_reason}` : "."} Only you can see it. You can appeal from Community notices.
        </p>
      ) : null}

      {item.title ? <h4 id={`c-${item.id}`} className="font-serif text-lg font-semibold">{item.title}</h4> : <span id={`c-${item.id}`} className="sr-only">{meta.label} by {author}</span>}
      <p className="whitespace-pre-wrap leading-relaxed">{item.body}</p>

      {item.kind === "prayer" && !hidden && item.visibility !== "private" ? (
        <PrayButton contributionId={item.id} count={item.prayer_count} prayed={item.i_prayed} mine={item.is_mine} locked={acksLocked || !canInteract} />
      ) : null}

      {repliesLocked ? <p className="text-sm text-muted">Replies are locked on this thread.</p> : null}
      <div className="flex flex-wrap items-center gap-1">
        {!hidden ? <ReplyThread contributionId={item.id} devotionalId={devotionalId} count={item.reply_count} canReply={canInteract && item.visibility !== "private" && !repliesLocked} /> : null}
        {item.is_mine ? (
          <OwnerActions
            hidden={{ id: item.id, devotionalId }}
            title={item.title}
            body={item.body}
            showTitle={item.kind === "prayer"}
            editAction={updateContributionAction}
            deleteAction={deleteContributionAction}
            maxLength={4000}
          />
        ) : (
          <>
            <ReportButton targetType="contribution" targetId={item.id} canBlock={item.visibility !== "anonymous"} />
            {isModerator ? <LeaderControls type="contribution" id={item.id} hidden={hidden} /> : null}
          </>
        )}
      </div>
      {isModerator && !item.is_mine ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-muted">Thread controls (moderators)</summary>
          <div className="pt-2"><ThreadControlsForm contributionId={item.id} repliesLocked={repliesLocked} acksLocked={acksLocked} isPrayer={item.kind === "prayer"} /></div>
        </details>
      ) : null}
    </article>
  );
}
