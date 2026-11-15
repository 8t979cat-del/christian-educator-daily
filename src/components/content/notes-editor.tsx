"use client";

import { useEffect, useRef, useState } from "react";
import { saveNoteAction } from "@/app/actions/devotional-state";
import { Button } from "@/components/ui/button";

const MAX = 5000;

type Status = "saved" | "dirty" | "saving" | "error";

/** Private notes. Saves on its own a moment after you stop typing, when you leave the box, and on request. */
export function NotesEditor({ devotionalId, initial }: { devotionalId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const [status, setStatus] = useState<Status>("saved");
  const [error, setError] = useState("");
  const savedText = useRef(initial);
  const latest = useRef(text);
  latest.current = text;

  async function save() {
    const value = latest.current;
    if (value === savedText.current) {
      setStatus("saved");
      return;
    }
    setStatus("saving");
    const result = await saveNoteAction(devotionalId, value);
    if (result.ok) {
      savedText.current = value;
      setStatus(latest.current === value ? "saved" : "dirty");
      setError("");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  useEffect(() => {
    if (status !== "dirty") return;
    const timer = window.setTimeout(save, 1500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, status]);

  const label =
    status === "saving" ? "Saving…" : status === "dirty" ? "Unsaved changes" : status === "error" ? error : text ? "Saved" : "";

  return (
    <section aria-labelledby="notes-title" className="rounded-card border border-line bg-surface p-6 print:hidden md:p-8">
      <h2 id="notes-title" className="font-serif text-xl font-semibold md:text-2xl">
        My notes
      </h2>
      <p className="mt-1 text-sm text-muted">Private to you. Not shown to colleagues, your school or anyone else.</p>
      <label htmlFor="note-box" className="sr-only">
        My notes for this devotional
      </label>
      <textarea
        id="note-box"
        value={text}
        maxLength={MAX}
        rows={5}
        onChange={(event) => {
          setText(event.target.value);
          setStatus("dirty");
        }}
        onBlur={save}
        placeholder="Thoughts, ideas for your class, prayer requests…"
        className="mt-3 min-h-32 w-full rounded-control border border-line-strong/60 bg-surface p-3 text-base"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className={status === "error" ? "text-sm font-medium text-danger" : "text-sm text-muted"}>
          {label}
        </p>
        <div className="flex items-center gap-3">
          {text.length > MAX - 500 ? <span className="text-sm text-muted">{MAX - text.length} left</span> : null}
          <Button type="button" variant="secondary" onClick={save} loading={status === "saving"} disabled={status === "saved"}>
            Save note
          </Button>
        </div>
      </div>
    </section>
  );
}
