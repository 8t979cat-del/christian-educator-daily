"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteVersionAction, relevelAction, saveVersionAction } from "@/app/actions/ai";
import { docToText, textToDoc } from "@/lib/content/editable";
import type { AiQuota } from "@/lib/ai/devotional-ai";
import { AiCounter, OUT_OF_REQUESTS, isUnlimited } from "./ai-counter";
import { BAND_LONG, BAND_SHORT, LEVEL_FIELDS, type GradeBand, type LevelField, type LevelVersion } from "@/lib/content/levels";

export type AiTools = {
  /** The teacher's plan includes the AI tools (Educator Plus or a school licence). */
  allowed: boolean;
  /** The server has an AI key. */
  configured: boolean;
  devotionalId: string;
  /** Requests left today; null when it could not be read. */
  quota: AiQuota | null;
};

const LABELS: Record<LevelField, { label: string; rows: number }> = {
  reflection: { label: "Reflection", rows: 8 },
  discussion_question: { label: "Discussion question", rows: 2 },
  practical_application: { label: "Put it into practice", rows: 2 },
  prayer: { label: "Closing prayer", rows: 3 },
};

const BTN = "min-h-11 rounded-control border border-[#777] px-3 text-sm font-semibold hover:bg-black/5 disabled:opacity-50";
const PRIMARY = "min-h-11 rounded-control border border-[#1c2a47] bg-[#1c2a47] px-3 text-sm font-semibold text-white hover:bg-[#121c31] disabled:opacity-50";

/**
 * Edit what the class sees, for the reading level in use: by hand, or with an AI
 * re-level the teacher reads before showing. Changes show on the class screen only
 * when the teacher chooses, and are saved only when they choose "Save my version".
 */
export function EditPanel({
  band, current, saved, tools, onApply, onSaved, onReset, onClose,
}: {
  band: GradeBand | null;
  /** The text the class sees now for this reading level. */
  current: Required<LevelVersion>;
  /** The teacher has a saved version for this reading level. */
  saved: boolean;
  tools: AiTools;
  onApply: (version: Required<LevelVersion>) => void;
  onSaved: (version: Required<LevelVersion>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<Record<LevelField, string>>(() => toText(current));
  const [aiDraft, setAiDraft] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "error"; message: string } | null>(null);
  const [pending, start] = useTransition();
  const [quota, setQuota] = useState<AiQuota | null>(tools.quota);
  const outOfRequests = quota !== null && !isUnlimited(quota) && quota.remaining <= 0;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button,textarea")?.focus();
    return () => previous?.focus?.();
  }, []);

  const level = band ? BAND_LONG[band] : "Standard text";
  const version = (): Required<LevelVersion> => ({
    reflection: textToDoc(text.reflection),
    discussion_question: textToDoc(text.discussion_question),
    practical_application: textToDoc(text.practical_application),
    prayer: textToDoc(text.prayer),
  });

  const relevel = () => {
    if (!band) return;
    setStatus({ tone: "info", message: `Writing a version for ${BAND_LONG[band].toLowerCase()}. This takes about half a minute.` });
    start(async () => {
      const result = await relevelAction({ devotionalId: tools.devotionalId, band });
      if (!result.ok) {
        setStatus({ tone: "error", message: result.error });
        if (/used today/.test(result.error) && quota) setQuota({ ...quota, remaining: 0 });
        return;
      }
      if (quota) setQuota({ ...quota, remaining: result.remaining });
      setText(toText(result.version));
      setAiDraft(true);
      setStatus({ tone: "info", message: "Here is the AI draft. Read it through and change anything before you show it to your class." });
    });
  };

  const save = () => start(async () => {
    const v = version();
    const result = await saveVersionAction({ devotionalId: tools.devotionalId, band, version: v, source: aiDraft ? "ai_leveled" : "edited" });
    if (!result.ok) { setStatus({ tone: "error", message: result.error }); return; }
    onSaved(v);
    setStatus({ tone: "info", message: `Saved. Your version is used whenever you present this devotional at ${band ? `grades ${BAND_SHORT[band]}` : "the standard level"}.` });
  });

  const reset = () => start(async () => {
    if (saved) {
      const result = await deleteVersionAction({ devotionalId: tools.devotionalId, band });
      if (!result.ok) { setStatus({ tone: "error", message: result.error }); return; }
    }
    onReset();
    onClose();
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Edit this devotional"
        className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 text-[#111]"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold">Edit this devotional</h2>
            <p className="text-sm text-[#333]">{level}{saved ? " · your saved version" : ""}</p>
          </div>
          <button type="button" onClick={onClose} className={BTN}>Close</button>
        </div>

        {!tools.allowed ? (
          <div className="mt-6 rounded-control border border-[#1c2a47]/40 bg-[#e7e9ef] p-4">
            <p className="font-semibold">Part of Educator Plus and school licences</p>
            <p className="mt-1 text-sm">
              Edit the text your class sees, re-level any devotional for K–2 to 9–12 with AI, and save your own versions.
            </p>
            <Link href="/upgrade" className="mt-3 inline-block font-semibold text-[#1c2a47] underline">See what Plus includes</Link>
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-[#333]">
              Scripture stays exactly as published. Edit the rest below; your changes reach the class screen only when you choose to show them.
            </p>

            <div className="mt-4 rounded-control border border-[#ccc] p-3">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={relevel} disabled={!band || !tools.configured || pending || outOfRequests} className={PRIMARY}>
                  {band ? `Re-level with AI for grades ${BAND_SHORT[band]}` : "Re-level with AI"}
                </button>
                {tools.configured && quota ? <AiCounter quota={quota} /> : null}
              </div>
              <p className="mt-2 text-sm text-[#333]">
                {!tools.configured
                  ? "The AI tools are not set up on this server yet."
                  : outOfRequests && quota
                    ? OUT_OF_REQUESTS(quota.limit)
                    : band
                      ? "Writes a fresh version of the reflection, question, practical step and prayer for this age. Uses one AI request."
                      : "Choose a reading level in Settings first."}
              </p>
            </div>

            {status ? (
              <p role={status.tone === "error" ? "alert" : "status"} className={`mt-4 rounded-control p-3 text-sm font-medium ${status.tone === "error" ? "bg-[#fbeae8] text-[#8a1c14]" : "bg-[#fff3cd]"}`}>
                {status.message}
              </p>
            ) : null}
            {aiDraft ? <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#1c2a47]">AI-adapted draft</p> : null}

            <div className="mt-3 grid gap-4" aria-busy={pending}>
              {LEVEL_FIELDS.map((f) => (
                <label key={f} className="grid gap-1">
                  <span className="text-sm font-bold">{LABELS[f].label}</span>
                  <textarea
                    value={text[f]}
                    onChange={(e) => setText((t) => ({ ...t, [f]: e.target.value }))}
                    rows={LABELS[f].rows}
                    maxLength={4000}
                    className="w-full rounded-control border border-[#777] p-2 text-base leading-snug"
                  />
                </label>
              ))}
              <p className="text-xs text-[#333]">Leave a blank line between paragraphs.</p>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" className={PRIMARY} disabled={pending} onClick={() => { onApply(version()); onClose(); }}>
                Show on the class screen
              </button>
              <button type="button" className={BTN} disabled={pending} onClick={save}>Save my version</button>
              <button type="button" className={`${BTN} sm:col-span-2`} disabled={pending} onClick={reset}>
                {saved ? "Delete my version and use the published text" : "Use the published text"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function toText(v: Required<LevelVersion>): Record<LevelField, string> {
  return {
    reflection: docToText(v.reflection),
    discussion_question: docToText(v.discussion_question),
    practical_application: docToText(v.practical_application),
    prayer: docToText(v.prayer),
  };
}
