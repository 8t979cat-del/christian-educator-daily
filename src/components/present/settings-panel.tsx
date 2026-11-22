"use client";

import { useEffect, useRef } from "react";
import type { GradeBand } from "@/lib/content/levels";
import { BandPicker } from "./band-picker";
import { PRESENT_THEMES, SECTION_IDS, SECTION_LABELS, SIZE_SCALES, THEME_IDS, type PresentSettings, type SectionId } from "@/lib/content/present";

const BTN = "min-h-11 rounded-control border border-current/40 px-3 text-sm font-semibold hover:bg-black/10";

/** What to show, how it looks, and print. Opens over the slide; Esc closes it. */
export function SettingsPanel({
  settings, onChange, onClose, onPrint, hasTheme, hasPassageText, onOpenPresenter, writtenBands, bandLabels, allowComments = false,
}: {
  writtenBands: GradeBand[];
  bandLabels?: Partial<Record<GradeBand, string>>;
  /** Signed-in teachers can turn on the class comment board. */
  allowComments?: boolean;
  settings: PresentSettings;
  onChange: (next: PresentSettings) => void;
  onClose: () => void;
  onPrint: () => void;
  hasTheme: boolean;
  hasPassageText: boolean;
  onOpenPresenter: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => previous?.focus?.();
  }, []);

  const set = <K extends keyof PresentSettings>(key: K, value: PresentSettings[K]) => onChange({ ...settings, [key]: value });
  const toggleSection = (id: SectionId) => onChange({ ...settings, sections: { ...settings.sections, [id]: !settings.sections[id] } });
  const anySection = SECTION_IDS.some((id) => settings.sections[id]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-brand/60" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Presentation settings"
        className="h-full w-full max-w-md overflow-y-auto bg-white p-5 text-[#111]"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold">Presentation settings</h2>
          <button type="button" onClick={onClose} className={BTN}>Done</button>
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold uppercase tracking-wider text-[#1c2a47]">Reading level</legend>
          <div className="mt-2">
            <BandPicker compact name="band-settings" value={settings.band} written={writtenBands} labels={bandLabels} onChange={(band) => set("band", band)} />
          </div>
          <p className="mt-2 text-sm text-[#333]">
            {settings.band
              ? "Same Scripture for every age. Younger levels get larger letters, and the youngest get simpler headings."
              : "Choose your students’ level. Until you do, the standard text is shown."}
          </p>
        </fieldset>
        <fieldset className="mt-6">
          <legend className="text-sm font-bold uppercase tracking-wider text-[#1c2a47]">Slides to show</legend>
          <ul className="mt-2 grid gap-1">
            {SECTION_IDS.map((id) => (
              <li key={id}>
                <label className="flex min-h-11 items-center gap-3 text-base">
                  <input type="checkbox" className="size-5" checked={settings.sections[id]} disabled={id === "theme" && !hasTheme} onChange={() => toggleSection(id)} />
                  {SECTION_LABELS[id]}
                  {id === "theme" && !hasTheme ? <span className="text-sm text-[#333]">(none this week)</span> : null}
                </label>
              </li>
            ))}
          </ul>
          {!anySection ? <p role="alert" className="mt-2 text-sm font-semibold text-[#b3261e]">Choose at least one slide.</p> : null}
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold uppercase tracking-wider text-[#1c2a47]">On the Scripture slide</legend>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={settings.showReference} onChange={() => set("showReference", !settings.showReference)} />Show the reference</label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={settings.showTranslation} onChange={() => set("showTranslation", !settings.showTranslation)} />Show the translation name</label>
          <p className="mt-1 text-sm text-[#333]">
            {hasPassageText
              ? "A small copyright or public-domain notice always stays with the text."
              : "This translation’s text can’t be displayed, so the reference always shows."}
          </p>
        </fieldset>


        {allowComments ? (
          <fieldset className="mt-6">
            <legend className="text-sm font-bold uppercase tracking-wider text-[#1c2a47]">Class comments (trial)</legend>
            <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="size-5" checked={settings.comments} onChange={() => set("comments", !settings.comments)} />Show class comments on the slides</label>
            <p className="text-sm text-[#333]">
              Type what students say (press C, or Comment) and it appears beside the slide with an emoji. Comments are never
              saved and disappear when you leave. Names, links and contact details are refused.
            </p>
          </fieldset>
        ) : null}

        <fieldset className="mt-6">
          <legend className="text-sm font-bold uppercase tracking-wider text-[#1c2a47]">Background</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {THEME_IDS.map((id) => {
              const t = PRESENT_THEMES[id];
              return (
                <label key={id} className="relative">
                  <input type="radio" name="theme" className="peer sr-only" checked={settings.theme === id} onChange={() => set("theme", id)} />
                  <span className="grid min-h-16 place-items-center rounded-control border-2 border-[#777] px-2 text-center text-sm font-bold peer-checked:border-[#1c2a47] peer-checked:ring-4 peer-checked:ring-[#1c2a47]/30 peer-focus-visible:ring-4 peer-focus-visible:ring-[#1c2a47]/50" style={{ background: t.bg, color: t.fg }}>
                    {t.label}
                    <span className="text-xs font-semibold" style={{ color: t.accent }}>Sample text</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="text-sm font-bold uppercase tracking-wider text-[#1c2a47]">Text size</legend>
          <input type="range" min={0} max={SIZE_SCALES.length - 1} step={1} value={settings.size} onChange={(e) => set("size", Number(e.target.value))} aria-label="Text size" aria-valuetext={`${Math.round(SIZE_SCALES[settings.size]! * 100)} percent`} className="mt-2 h-11 w-full" />
          <p className="text-sm text-[#333]">Larger text moves more words onto the next slide, so it stays large and nothing is cut off.</p>
        </fieldset>

        <div className="mt-8 grid gap-2">
          <button type="button" onClick={onPrint} className={BTN}>Print slides, or save as PDF</button>
          <button type="button" onClick={onOpenPresenter} className={BTN}>Open presenter window (with notes)</button>
          <p className="text-sm text-[#333]">
            Using a projector? Drag the class screen to the projector, keep the presenter window on your laptop, and your notes stay off the big screen.
          </p>
        </div>

        <details className="mt-6">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">Keyboard shortcuts</summary>
          <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
            <dt className="font-mono">→ Space PgDn</dt><dd>Next slide</dd>
            <dt className="font-mono">← PgUp</dt><dd>Previous slide</dd>
            <dt className="font-mono">Home End</dt><dd>First, last slide</dd>
            <dt className="font-mono">+ −</dt><dd>Text size</dd>
            <dt className="font-mono">F</dt><dd>Full screen</dd>
            <dt className="font-mono">B</dt><dd>Blank the screen</dd>
            <dt className="font-mono">N</dt><dd>Presenter notes</dd>
            <dt className="font-mono">S</dt><dd>This panel</dd>
            <dt className="font-mono">Esc</dt><dd>Close panel, leave full screen, then exit</dd>
          </dl>
        </details>
        <p className="mt-6 text-sm text-[#333]">These settings are remembered on this computer.</p>
      </div>
    </div>
  );
}
