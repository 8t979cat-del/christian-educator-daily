"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { previewPassageAction, saveWrittenAction } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { BIBLES, BIBLE_CODES, type BibleCode } from "@/lib/bible/bibles";

type Text = { reflection: string; discussion_question: string; practical_application: string; prayer: string };
export type WrittenDraft = { id: string | null; title: string; topic: string; reference: string; translation: BibleCode; text: Text };

const FIELDS: Array<{ key: keyof Text; label: string; hint: string; rows: number }> = [
  { key: "reflection", label: "Reflection", hint: "A few short paragraphs connecting the passage to your students’ lives. Leave a blank line between paragraphs.", rows: 8 },
  { key: "discussion_question", label: "A question to talk about", hint: "One open question the class can answer.", rows: 2 },
  { key: "practical_application", label: "Put it into practice", hint: "One small thing to try today.", rows: 3 },
  { key: "prayer", label: "Closing prayer", hint: "A short prayer the class can pray together.", rows: 4 },
];

const field = "w-full rounded-control border border-line-strong/60 bg-surface px-3 py-2 leading-snug focus-visible:outline-2 focus-visible:outline-brand";

export const EMPTY_WRITTEN: WrittenDraft = {
  id: null, title: "", topic: "", reference: "", translation: "kjv",
  text: { reflection: "", discussion_question: "", practical_application: "", prayer: "" },
};

/**
 * A devotional from a blank page: title, topic, a passage from a public-domain Bible
 * (its words are looked up, not typed), and the four parts. Saved to the teacher's
 * own list, where it can be presented or submitted for publishing.
 */
export function BlankWriter({ initial, justSaved = false }: { initial: WrittenDraft; justSaved?: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<WrittenDraft>(initial);
  const [passage, setPassage] = useState<{ reference: string; text: string } | null>(null);
  const [passageError, setPassageError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(justSaved);
  const [pending, start] = useTransition();
  const [looking, startLooking] = useTransition();

  const set = (patch: Partial<WrittenDraft>) => { setD((x) => ({ ...x, ...patch })); setSaved(false); };
  const setText = (key: keyof Text, value: string) => { setD((x) => ({ ...x, text: { ...x.text, [key]: value } })); setSaved(false); };

  const look = (translation: BibleCode = d.translation, reference = d.reference) => {
    setPassageError(null);
    if (!reference.trim()) { setPassage(null); return; }
    startLooking(async () => {
      const result = await previewPassageAction({ reference, translation });
      if (result.ok) setPassage({ reference: result.reference, text: result.text });
      else { setPassage(null); setPassageError(result.error); }
    });
  };

  // Editing a saved devotional: show its passage straight away.
  useEffect(() => {
    if (initial.reference) look(initial.translation, initial.reference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    setError(null);
    start(async () => {
      const result = await saveWrittenAction(d);
      if (!result.ok) { setError(result.error); return; }
      setSaved(true);
      if (!d.id) router.push(`/create?mode=blank&edit=${result.id}&saved=1`);
      else router.refresh();
    });
  };

  return (
    <form className="grid max-w-[44rem] gap-6" onSubmit={(e) => { e.preventDefault(); save(); }} aria-busy={pending}>
      <label className="grid gap-1">
        <span className="text-sm font-semibold">Title</span>
        <input value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={140} required className={`${field} font-serif text-xl`} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-semibold">Topic <span className="font-normal text-muted">(optional)</span></span>
        <input value={d.topic} onChange={(e) => set({ topic: e.target.value })} maxLength={140} placeholder="For example, Being patient with each other" className={field} />
      </label>

      <fieldset className="grid gap-3 border-y border-line py-5">
        <legend className="sr-only">Scripture</legend>
        <p className="font-serif text-lg">Scripture</p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Reference</span>
            <input
              value={d.reference}
              onChange={(e) => { set({ reference: e.target.value }); setPassage(null); }}
              onBlur={() => look()}
              maxLength={120}
              placeholder="Galatians 6:9–10"
              className={`${field} min-h-11`}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-semibold">Translation</span>
            <select value={d.translation} onChange={(e) => { const t = e.target.value as BibleCode; set({ translation: t }); look(t); }} className={`${field} min-h-11`}>
              {BIBLE_CODES.map((code) => <option key={code} value={code}>{BIBLES[code].label}</option>)}
            </select>
          </label>
        </div>
        <p className="text-sm text-muted">The words of the passage are filled in from the translation you choose. At most 20 verses, so it fits on a few slides.</p>
        {looking ? <p className="text-sm italic text-muted">Looking up the passage…</p> : null}
        {passageError ? <p role="alert" className="text-sm text-danger">{passageError}</p> : null}
        {passage ? (
          <figure className="border-l-2 border-rubric/60 pl-4">
            <blockquote className="max-h-56 overflow-y-auto whitespace-pre-line font-serif leading-relaxed">{passage.text}</blockquote>
            <figcaption className="mt-2 font-serif text-sm italic text-muted">{passage.reference} · {BIBLES[d.translation].label}</figcaption>
          </figure>
        ) : null}
      </fieldset>

      {FIELDS.map((f) => (
        <label key={f.key} className="grid gap-1">
          <span className="font-serif text-lg">{f.label}</span>
          <span className="text-sm text-muted">{f.hint}</span>
          <textarea value={d.text[f.key]} onChange={(e) => setText(f.key, e.target.value)} rows={f.rows} maxLength={4000} className={`${field} font-serif text-lg leading-relaxed`} />
        </label>
      ))}

      {error ? <p role="alert" className="rounded-control bg-danger-soft p-3 font-medium text-danger">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !d.title.trim()}>{pending ? "Saving…" : d.id ? "Save changes" : "Save devotional"}</Button>
        {d.id ? <Button type="button" variant="secondary" onClick={() => router.push(`/create/${d.id}/present`)}>Present</Button> : null}
        <p role="status" className="font-medium text-brand empty:hidden">{saved ? "Saved. It is in Your devotionals below, where you can present it or submit it for publishing." : ""}</p>
      </div>
    </form>
  );
}
