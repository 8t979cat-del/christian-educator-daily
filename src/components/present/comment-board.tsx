"use client";

import { useEffect, useRef, useState } from "react";
import { screenPublicText } from "@/lib/community/screening";
import { COMMENT_EMOJIS, MAX_COMMENT, parseCommentCommand } from "@/lib/content/class-comments";

export type ClassComment = { id: number; text: string; emoji: string | null };

/** Comments on the current slide, shown beside it on the class screen. */
export function CommentRail({ comments, onRemove }: { comments: ClassComment[]; onRemove: (id: number) => void }) {
  return (
    <aside aria-label="Class comments" className="absolute inset-y-14 right-[2vw] z-10 flex w-[26%] flex-col gap-[1.2vh] overflow-y-auto">
      <h2 className="text-[clamp(14px,1.8vh,22px)] font-semibold" style={{ color: "var(--p-accent)" }}>Our class says</h2>
      <ul className="grid gap-[1.2vh]">
        {comments.map((c) => (
          <li
            key={c.id}
            className="group relative rounded-xl border-2 p-[1.4vh] text-[clamp(16px,2.6vh,34px)] leading-snug"
            style={{ borderColor: "color-mix(in srgb, var(--p-accent) 45%, transparent)", background: "color-mix(in srgb, var(--p-accent) 8%, var(--p-bg))" }}
          >
            {c.emoji ? <span className="mr-[0.3em]" aria-hidden="true">{c.emoji}</span> : null}
            {c.text}
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              className="absolute right-1 top-1 hidden min-h-8 min-w-8 rounded-md text-sm font-semibold opacity-70 group-hover:block group-focus-within:block hover:opacity-100"
              aria-label={`Remove comment: ${c.text}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * The teacher types what a student said, picks an emoji (or ends with
 * "post comment with smiley emoji"), and it appears on the slide. Screened for
 * names and contact details, like everything shown publicly.
 */
export function CommentComposer({ onPost, onClose }: { onPost: (text: string, emoji: string | null) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const submit = (raw: string, chosen: string | null) => {
    const parsed = parseCommentCommand(raw);
    const body = parsed.text.slice(0, MAX_COMMENT).trim();
    if (!body) { setProblem("Type what the student said first."); return; }
    const screened = screenPublicText(body);
    if (!screened.ok) { setProblem(screened.reason); return; }
    onPost(body, parsed.emoji ?? chosen);
    setText("");
    setEmoji(null);
    setProblem(null);
  };

  return (
    <form
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[#ccc] bg-white p-3 text-[#111] shadow-[0_-12px_30px_-20px_rgb(0_0_0/0.5)]"
      onSubmit={(e) => { e.preventDefault(); submit(text, emoji); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
      aria-label="Add a class comment"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
        <label className="min-w-[16rem] flex-1">
          <span className="sr-only">What did the student say?</span>
          <input
            ref={input}
            type="text"
            value={text}
            maxLength={MAX_COMMENT + 60}
            onChange={(e) => {
              setText(e.target.value);
              setProblem(null);
              // A finished spoken-style command posts at once: "…, post comment with smiley emoji".
              const parsed = parseCommentCommand(e.target.value);
              if (parsed.post && /emoji|face|[.!]$/i.test(e.target.value.trim()) && parsed.text) submit(e.target.value, emoji);
            }}
            placeholder="What did the student say? (or end with “post comment with smiley emoji”)"
            className="min-h-11 w-full rounded-md border border-[#777] px-3 text-base"
          />
        </label>
        <div role="radiogroup" aria-label="Emoji" className="flex gap-1">
          {COMMENT_EMOJIS.map((e) => (
            <button
              key={e.emoji}
              type="button"
              role="radio"
              aria-checked={emoji === e.emoji}
              aria-label={e.label}
              onClick={() => setEmoji((cur) => (cur === e.emoji ? null : e.emoji))}
              className={`grid size-11 place-items-center rounded-md border-2 text-xl ${emoji === e.emoji ? "border-[#0b4f49] bg-[#e3efec]" : "border-transparent hover:border-[#ccc]"}`}
            >
              {e.emoji}
            </button>
          ))}
        </div>
        <button type="submit" className="min-h-11 rounded-md border border-[#0b4f49] bg-[#0b4f49] px-4 font-semibold text-white">Post</button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-[#777] px-3 font-semibold">Done</button>
      </div>
      {problem ? <p role="alert" className="mx-auto mt-2 max-w-5xl text-sm font-semibold text-[#8a1c14]">{problem}</p> : null}
      <p className="mx-auto mt-1 max-w-5xl text-xs text-[#333]">Comments stay on this screen only and disappear when you leave. Nothing is saved or sent anywhere.</p>
    </form>
  );
}
