"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveGeneratedAction, writeDevotionalAction, type GeneratedDraft } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { docToText, textToDoc } from "@/lib/content/editable";
import { BANDS, BAND_LONG, type GradeBand, type LevelField } from "@/lib/content/levels";
import { TopicMap } from "./topic-map";

const FIELDS: Array<{ key: LevelField; label: string; rows: number }> = [
  { key: "reflection", label: "Reflection", rows: 7 },
  { key: "discussion_question", label: "Discussion question", rows: 2 },
  { key: "practical_application", label: "Put it into practice", rows: 2 },
  { key: "prayer", label: "Closing prayer", rows: 3 },
];

const field = "w-full rounded-control border border-line-strong/60 bg-surface px-3 py-2 leading-snug focus-visible:outline-2 focus-visible:outline-brand";

export function CreateStudio({ allowed, configured }: { allowed: boolean; configured: boolean }) {
  const router = useRouter();
  const [focus, setFocus] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [band, setBand] = useState<GradeBand>("g35");
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);
  const [text, setText] = useState<Record<LevelField, string> | null>(null);
  const [title, setTitle] = useState("");
  const [tried, setTried] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (t: string) => setTopics((list) => (list.includes(t) ? list.filter((x) => x !== t) : [...list, t]));

  const write = (again: boolean) => {
    setError(null);
    start(async () => {
      const result = await writeDevotionalAction({ topics, band });
      if (!result.ok) { setError(result.error); return; }
      setDraft(result.draft);
      setTitle(result.draft.title);
      setText({
        reflection: docToText(result.draft.version.reflection),
        discussion_question: docToText(result.draft.version.discussion_question),
        practical_application: docToText(result.draft.version.practical_application),
        prayer: docToText(result.draft.version.prayer),
      });
      setTried((t) => (again ? [...t, result.draft.reference] : [result.draft.reference]));
    });
  };

  const save = () => {
    if (!draft || !text) return;
    setError(null);
    start(async () => {
      const result = await saveGeneratedAction({
        title, topic: draft.topic, reference: draft.reference, topics,
        version: {
          reflection: textToDoc(text.reflection),
          discussion_question: textToDoc(text.discussion_question),
          practical_application: textToDoc(text.practical_application),
          prayer: textToDoc(text.prayer),
        },
      });
      if (!result.ok) { setError(result.error); return; }
      router.push(`/create/${result.id}/present`);
    });
  };

  if (!allowed) {
    return (
      <div className="rounded-card border border-brand/30 bg-brand-soft p-6">
        <p className="font-serif text-xl font-semibold">Part of Educator Plus and school licences</p>
        <p className="mt-2 max-w-2xl">
          Choose topics from the web and AI writes a complete devotional around a passage of Scripture, at your students’
          reading level, for you to review, edit and present.
        </p>
        <Link href="/upgrade" className="mt-4 inline-block font-semibold text-brand underline">See what Plus includes</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <section aria-labelledby="topics-h">
        <h2 id="topics-h" className="font-serif text-2xl font-semibold">1. Choose topics</h2>
        <div className="mt-4">
          <TopicMap focus={focus} selected={topics} onFocus={setFocus} onToggle={toggle} />
        </div>
      </section>

      <section aria-labelledby="write-h" className="grid gap-6">
        <div>
          <h2 id="write-h" className="font-serif text-2xl font-semibold">2. Write it</h2>
          <p className="mt-2 text-sm font-semibold">Your topics</p>
          {topics.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {topics.map((t) => (
                <li key={t}>
                  <button type="button" onClick={() => toggle(t)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-3 font-semibold text-brand" aria-label={`Remove ${t}`}>
                    {t} <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted">None yet. Choose them from the web.</p>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Reading level</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BANDS.map((b) => (
              <label key={b} className="relative">
                <input type="radio" name="band" className="peer sr-only" checked={band === b} onChange={() => setBand(b)} />
                <span className="grid min-h-11 place-items-center rounded-control border-2 border-line-strong/40 bg-surface px-2 text-center text-sm font-semibold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40">
                  {BAND_LONG[b].replace("Kindergarten to grade 2", "K to grade 2")}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <Button onClick={() => write(false)} disabled={!configured || topics.length === 0 || pending}>
            {pending && !draft ? "Writing…" : draft ? "Write a new one with these topics" : "Write a devotional"}
          </Button>
          <p className="mt-2 text-sm text-muted">
            {!configured
              ? "The AI tools are not set up on this server yet."
              : "Takes about half a minute and uses one of your 40 daily AI requests. Scripture comes from the King James Version, never from the AI."}
          </p>
        </div>

        {error ? <p role="alert" className="rounded-control bg-danger-soft p-3 font-medium text-danger">{error}</p> : null}

        {draft && text ? (
          <article aria-labelledby="draft-h" className="grid gap-4 rounded-card border border-line bg-surface p-5" aria-busy={pending}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="draft-h" className="font-serif text-xl font-semibold">3. Review the draft</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-brand">AI-written draft</span>
            </div>
            <p className="text-sm text-muted">Read it through and change anything you like before your class sees it.</p>
            <label className="grid gap-1">
              <span className="text-sm font-semibold">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className={field} />
            </label>
            <figure className="rounded-control bg-parchment p-4">
              <figcaption className="font-serif font-semibold text-brand">{draft.reference} · {draft.translationLabel}</figcaption>
              <blockquote className="mt-2 max-h-48 overflow-y-auto whitespace-pre-line font-serif leading-relaxed">{draft.scriptureText}</blockquote>
            </figure>
            {FIELDS.map((f) => (
              <label key={f.key} className="grid gap-1">
                <span className="text-sm font-semibold">{f.label}</span>
                <textarea value={text[f.key]} rows={f.rows} maxLength={4000} onChange={(e) => setText((t) => (t ? { ...t, [f.key]: e.target.value } : t))} className={field} />
              </label>
            ))}
            <div className="flex flex-wrap gap-3">
              <Button onClick={save} disabled={pending || title.trim() === ""}>Save and present</Button>
              <Button variant="secondary" onClick={() => write(true)} disabled={pending}>Write a different one</Button>
            </div>
            {tried.length > 1 ? <p className="text-xs text-muted">Passages tried: {tried.join(", ")}</p> : null}
          </article>
        ) : null}
      </section>
    </div>
  );
}
