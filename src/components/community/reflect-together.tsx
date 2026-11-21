import Link from "next/link";
import { CovenantNeeded } from "@/components/governance/forms";
import { covenantStatus, discussionState, threadControls } from "@/lib/governance/queries";
import { ContributionCard } from "./contribution-card";
import { Composer } from "./composer";
import { EmptyState } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";
import { CONTRIBUTION_KINDS, KIND_LABELS } from "@/lib/community/covenant";
import { contributionCounts, listContributions } from "@/lib/community/queries";
import type { ContributionKind } from "@/lib/community/types";

export type ReflectParams = { kind?: string; q?: string; sort?: string; ts?: string; id?: string };

const isKind = (v: string | undefined): v is ContributionKind => Boolean(v) && (CONTRIBUTION_KINDS as string[]).includes(v!);

/**
 * "Reflect Together": the discussion for one published devotional. It is optional and
 * entirely separate from reading and from classroom presentation. Order is chronological,
 * newest first by default, and never by popularity.
 */
export async function ReflectTogether({
  devotionalId,
  params,
  timeZone,
  enabled,
  canParticipate,
  isModerator = false,
}: {
  devotionalId: string;
  params: ReflectParams;
  timeZone: string;
  enabled: boolean;
  canParticipate: boolean;
  isModerator?: boolean;
}) {
  if (!enabled) return null;

  const [discussion, covenant, locks] = await Promise.all([discussionState(devotionalId), covenantStatus(), threadControls(devotionalId)]);
  if (!discussion.enabled && !isModerator) {
    return (
      <section id="reflect-together" aria-labelledby="reflect-heading" className="mx-auto w-full max-w-3xl print:hidden">
        <h2 id="reflect-heading" className="font-serif text-3xl font-normal">Reflect Together</h2>
        <p className="mt-2 rounded-control border border-line bg-surface p-4 text-muted">Discussion is turned off for this devotional. The devotional itself is unaffected.</p>
      </section>
    );
  }
  const lockOf = new Map(locks.map((l) => [l.contribution_id, l]));

  const kind = isKind(params.kind) ? params.kind : null;
  const q = (params.q ?? "").trim().slice(0, 100) || null;
  const oldestFirst = params.sort === "oldest";
  const cursor = params.ts && params.id ? { ts: params.ts, id: params.id } : null;

  const [counts, { items, next }] = await Promise.all([
    contributionCounts(devotionalId),
    listContributions({ devotionalId, kind, q, oldestFirst, cursor }),
  ]);

  const href = (over: Partial<Record<keyof ReflectParams, string | null>>) => {
    const merged: Record<string, string | null | undefined> = { kind: kind ?? null, q, sort: oldestFirst ? "oldest" : null, ...over };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(`r_${k}`, v);
    const s = sp.toString();
    return `?${s}#reflect-together`;
  };

  const tabs: Array<{ key: ContributionKind | null; label: string; n: number }> = [
    { key: null, label: "All reflections", n: counts.all },
    ...CONTRIBUTION_KINDS.map((k) => ({ key: k as ContributionKind | null, label: KIND_LABELS[k].plural, n: counts[k] })),
  ];

  return (
    <section id="reflect-together" aria-labelledby="reflect-heading" className="mx-auto grid w-full max-w-3xl gap-6 print:hidden">
      <div>
        <h2 id="reflect-heading" className="font-serif text-3xl font-normal">Reflect Together</h2>
        <p className="mt-2 text-muted">
          Share a reflection, a prayer, a question, or a word of encouragement about this passage. It is entirely optional.{" "}
          <Link href="/community/covenant" className="text-brand underline">Our community covenant</Link>
        </p>
      </div>

      {!discussion.enabled ? (
        <p role="note" className="rounded-control border border-line bg-surface p-4 text-sm">Discussion is turned off for this devotional. Only moderators and each author can see what is here.</p>
      ) : null}
      {discussion.pinned_question ? (
        <aside aria-label="Question from the editors" className="rounded-card border border-brand/30 bg-brand-soft p-5">
          <p className="text-sm font-semibold text-brand">A question from our editors</p>
          <p className="mt-1 font-serif text-xl">{discussion.pinned_question}</p>
        </aside>
      ) : null}

      {!canParticipate ? (
        <p className="rounded-control border border-line bg-surface p-4 text-sm text-muted">
          Your community access is paused, so you can read but not post. Details are in <Link href="/community/notices" className="text-brand underline">Community notices</Link>.
        </p>
      ) : discussion.closed || !discussion.enabled ? (
        <p role="note" className="rounded-control border border-line bg-surface p-4 text-sm">This discussion is closed. You can still read it, and pray for what has been shared.</p>
      ) : covenant.required && !covenant.accepted ? (
        <CovenantNeeded version={covenant.version} />
      ) : (
        <Composer devotionalId={devotionalId} />
      )}

      <nav aria-label="Filter the discussion">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = (t.key ?? null) === kind;
            return (
              <li key={t.label}>
                <Link
                  href={href({ kind: t.key, ts: null, id: null })}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={
                    "inline-flex min-h-11 items-center gap-2 rounded-control border px-4 text-sm font-semibold " +
                    (active ? "border-brand bg-brand-soft text-brand" : "border-line-strong/60 hover:bg-brand-soft")
                  }
                >
                  {t.label}
                  <span className="text-muted">{t.n}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-end gap-3">
        <form method="get" action="#reflect-together" role="search" className="flex min-w-0 flex-1 gap-2">
          {kind ? <input type="hidden" name="r_kind" value={kind} /> : null}
          {oldestFirst ? <input type="hidden" name="r_sort" value="oldest" /> : null}
          <div className="relative min-w-0 flex-1">
            <label htmlFor="r-search" className="sr-only">Search this discussion</label>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              id="r-search"
              type="search"
              name="r_q"
              defaultValue={q ?? ""}
              placeholder="Search this discussion"
              maxLength={100}
              className="min-h-11 w-full rounded-control border border-line-strong/60 bg-surface py-2 pl-10 pr-3 text-base"
            />
          </div>
          <button type="submit" className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-4 font-semibold hover:bg-brand-soft">Search</button>
        </form>
        <Link
          href={href({ sort: oldestFirst ? null : "oldest", ts: null, id: null })}
          scroll={false}
          className="inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-brand hover:bg-brand-soft"
        >
          {oldestFirst ? "Show newest first" : "Show oldest first"}
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon="users"
          title={q || kind ? "Nothing matches yet" : "No one has shared yet"}
          description={q || kind ? "Try another filter or search." : "You are welcome to begin. Or simply read, pray and move on; that is a good use of this page too."}
        />
      ) : (
        <ol className="grid gap-4" aria-label="Contributions, in order of time">
          {items.map((item) => (
            <li key={item.id}>
              <ContributionCard item={item} devotionalId={devotionalId} timeZone={timeZone} canInteract={canParticipate && discussion.enabled && !discussion.closed && (!covenant.required || covenant.accepted)} isModerator={isModerator} repliesLocked={lockOf.get(item.id)?.replies_locked ?? false} acksLocked={lockOf.get(item.id)?.acks_locked ?? false} />
            </li>
          ))}
        </ol>
      )}

      {cursor || next ? (
        <nav aria-label="More contributions" className="flex flex-wrap justify-between gap-3">
          {cursor ? <Link href={href({ ts: null, id: null })} scroll={false} className="min-h-11 rounded-control px-3 py-2 text-brand underline">Back to the start</Link> : <span />}
          {next ? (
            <Link href={href({ ts: next.ts, id: next.id })} scroll={false} className="min-h-11 rounded-control border border-line-strong/60 bg-surface px-5 py-2 font-semibold hover:bg-brand-soft">
              {oldestFirst ? "Show later contributions" : "Show earlier contributions"}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
