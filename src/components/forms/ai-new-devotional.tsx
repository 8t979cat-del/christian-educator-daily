"use client";

import { useRef, useState, useTransition } from "react";
import { writeDevotionalAction } from "@/app/actions/ai";
import { AiCounter, OUT_OF_REQUESTS, isUnlimited } from "@/components/present/ai-counter";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { AiQuota } from "@/lib/ai/devotional-ai";
import { BIBLES, BIBLE_CODES, type BibleCode } from "@/lib/bible/bibles";
import { BAND_LONG, STANDARD_BAND, type GradeBand } from "@/lib/content/levels";
import { CATEGORIES } from "@/lib/content/options";
import { DevotionalForm, type ThemeOption, type TranslationOption } from "./devotional-form";

const MAX = 3;
type Initial = Parameters<typeof DevotionalForm>[0]["initial"];

/**
 * The editor's "New devotional" page with an AI first draft on top: choose up to
 * three categories and a reading level, and the AI writes a devotional that fills
 * the normal form below. Nothing is saved until the editor saves the form, and it
 * is saved as a draft like any other. Scripture text comes from the chosen bundled
 * public-domain Bible (KJV, WEB or ASV), never from the AI.
 */
export function NewDevotionalWithAi({
  initial,
  translations,
  themes,
  ai,
}: {
  initial: Initial;
  translations: TranslationOption[];
  themes: ThemeOption[];
  ai: { configured: boolean; quota: AiQuota | null };
}) {
  const [form, setForm] = useState<{ initial: Initial; key: number }>({ initial, key: 0 });
  const [chosen, setChosen] = useState<string[]>([]);
  // The standard text is written for grades 6 to 8; the other ages are drafted from it under Reading levels.
  const band: GradeBand = STANDARD_BAND;
  const [bible, setBible] = useState<BibleCode>("kjv");
  const [quota, setQuota] = useState<AiQuota | null>(ai.quota);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const formTop = useRef<HTMLDivElement>(null);
  const out = quota !== null && !isUnlimited(quota) && quota.remaining <= 0;
  const blocked = !ai.configured || pending || out;

  const toggle = (slug: string) =>
    setChosen((list) => (list.includes(slug) ? list.filter((s) => s !== slug) : list.length >= MAX ? list : [...list, slug]));

  const write = (slugs: string[]) => {
    setError(null);
    setDone(null);
    start(async () => {
      const names = slugs.map((s) => CATEGORIES.find((c) => c.slug === s)?.name ?? s);
      const result = await writeDevotionalAction({ topics: names, band, translation: bible });
      if (!result.ok) {
        setError(result.error);
        if (/used today/.test(result.error) && quota) setQuota({ ...quota, remaining: 0 });
        return;
      }
      if (quota) setQuota({ ...quota, remaining: result.remaining });
      const d = result.draft;
      setForm((f) => ({
        key: f.key + 1,
        initial: {
          ...initial,
          title: d.title,
          daily_topic: d.topic,
          category_slug: slugs[0] ?? null,
          scripture_reference: d.reference,
          // The passage text always comes from the bundled public-domain Bible, not the AI.
          translation_code: d.translationCode,
          scripture_text: d.scriptureText,
          reflection: d.version.reflection,
          prayer: d.version.prayer,
          discussion_question: d.version.discussion_question,
          practical_application: d.version.practical_application,
        },
      }));
      setDone(`Draft written on ${d.reference}. Review it below, then save. It is saved as a draft.`);
      requestAnimationFrame(() => formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
  };

  const surprise = () => {
    const pool = [...CATEGORIES.map((c) => c.slug)];
    const pick = () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
    const slugs = [pick(), pick()];
    setChosen(slugs);
    write(slugs);
  };

  return (
    <div className="grid gap-8">
      <section aria-labelledby="ai-new-h" className="rounded-card border border-line bg-surface p-5 shadow-card md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="ai-new-h" className="font-serif text-2xl">Start from an AI draft</h2>
          {ai.configured && quota ? <AiCounter quota={quota} /> : null}
        </div>
        <p className="mt-1 max-w-[40rem] text-muted">
          Choose up to {MAX} categories and a reading level. The AI fills in the form below: title, topic, a Bible passage in the translation you choose and
          all four parts. You review and edit it before saving. Or skip this and write it yourself.
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Categories <span className="font-normal text-muted">({chosen.length} of {MAX})</span></legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const on = chosen.includes(c.slug);
              return (
                <li key={c.slug}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={!on && chosen.length >= MAX}
                    onClick={() => toggle(c.slug)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-sm font-semibold transition-colors disabled:opacity-40 ${
                      on ? "border-brand bg-brand-soft text-brand" : "border-line-strong/50 bg-surface text-ink hover:border-brand"
                    }`}
                  >
                    {on ? <Icon name="check" size={14} /> : null}
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <p className="mt-5 text-sm text-muted">
          Written for {BAND_LONG[band].toLowerCase()}, as the standard text. The other ages are drafted from it under Reading levels.
        </p>

        <fieldset className="mt-5">
          <legend className="text-sm font-semibold">Translation</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {BIBLE_CODES.map((code) => (
              <label key={code} className="relative">
                <input type="radio" name="ai-bible" className="peer sr-only" checked={bible === code} onChange={() => setBible(code)} />
                <span className="grid min-h-11 place-items-center rounded-control border border-line-strong/50 bg-surface px-2 text-center text-sm font-semibold peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand peer-focus-visible:ring-4 peer-focus-visible:ring-brand/40">
                  {BIBLES[code].label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => write(chosen)} disabled={blocked || chosen.length === 0}>
            {pending ? "Writing…" : form.key > 0 ? "Write another" : "Write the draft"}
          </Button>
          <Button variant="secondary" onClick={surprise} disabled={blocked}>Surprise me</Button>
        </div>
        <p className="mt-2 text-sm text-muted">
          {!ai.configured
            ? "The AI tools are not set up on this server yet."
            : out && quota
              ? OUT_OF_REQUESTS(quota.limit)
              : "Takes about half a minute. Writing a draft replaces what is in the form below. “Surprise me” picks two categories at random."}
        </p>
        {error ? <p role="alert" className="mt-3 rounded-control bg-danger-soft p-3 font-medium text-danger">{error}</p> : null}
        <p role="status" className="mt-3 font-medium text-brand empty:hidden">{done}</p>
      </section>

      <div ref={formTop} className="scroll-mt-24">
        <DevotionalForm key={form.key} initial={form.initial} translations={translations} themes={themes} ai={ai} />
      </div>
    </div>
  );
}
