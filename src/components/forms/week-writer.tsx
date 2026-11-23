"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { writeWeekAction } from "@/app/actions/ai";
import { AiCounter } from "@/components/present/ai-counter";
import type { AiQuota } from "@/lib/ai/devotional-ai";
import { BIBLES, BIBLE_CODES, type BibleCode } from "@/lib/bible/bibles";

/**
 * Editors: one button that writes every empty day of a weekly theme with AI, each saved as a
 * draft with all four reading levels. Nothing is published; each day still needs review.
 */
export function WeekWriter({ themeId, empty, configured, quota }: { themeId: string; empty: number; configured: boolean; quota: AiQuota | null }) {
  const router = useRouter();
  const [bible, setBible] = useState<BibleCode>("kjv");
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [left, setLeft] = useState(quota);

  const write = () => {
    setMessage({ tone: "info", text: `Writing ${empty === 5 ? "the week" : `${empty} day${empty === 1 ? "" : "s"}`}. This takes a minute or two; keep this page open.` });
    start(async () => {
      const result = await writeWeekAction({ themeId, translation: bible });
      if (!result.ok) { setMessage({ tone: "error", text: result.error }); return; }
      if (left && result.remaining !== null) setLeft({ ...left, remaining: result.remaining });
      setMessage({
        tone: result.failed.length ? "error" : "info",
        text: `Drafted ${result.written.join(", ")}, each with all four reading levels. Open each one to read and edit it, then send it for review.${result.failed.length ? ` Not written: ${result.failed.join("; ")}. Try again to fill them.` : ""}`,
      });
      router.refresh();
    });
  };

  if (empty === 0) return <p className="text-sm text-muted">Every day of this week has a devotional.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">
        Writes the {empty === 5 ? "five days" : `${empty} empty day${empty === 1 ? "" : "s"}`} as one arc on this theme: a title, a passage and the standard text
        (grades 6 to 8) for each day, plus its K–2, 3–5 and 9–12 versions. Each is saved as a draft for you to read and edit. Days already written are kept.
      </p>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">Translation</legend>
        <div className="flex flex-wrap gap-3">
          {BIBLE_CODES.map((code) => (
            <label key={code} className="flex items-center gap-2 text-sm">
              <input type="radio" name="week-bible" value={code} checked={bible === code} onChange={() => setBible(code)} className="size-4 accent-brand" />
              {BIBLES[code].label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={write}
          disabled={!configured || pending}
          className="inline-flex min-h-11 items-center rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover disabled:opacity-50"
        >
          {pending ? "Writing…" : empty === 5 ? "Write the week with AI" : "Write the empty days with AI"}
        </button>
        {configured && left ? <AiCounter quota={left} /> : null}
      </div>
      {!configured ? <p className="text-sm text-muted">The AI tools are not set up on this server yet (ANTHROPIC_API_KEY).</p> : null}
      {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-medium ${message.tone === "error" ? "text-danger" : "text-brand"}`}>{message.text}</p> : null}
    </div>
  );
}
