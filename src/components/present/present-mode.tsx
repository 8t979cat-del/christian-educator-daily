"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEFAULT_SETTINGS, SIZE_SCALES, buildSlides, equivalentIndex, parseSettings,
  type PresentContent, type PresentSettings, type Stage,
} from "@/lib/content/present";
import { BANDS, BAND_SHORT, STANDARD_BAND, bandsWithVersion, textForBand, type GradeBand, type Levels, type LevelVersion } from "@/lib/content/levels";
import { ensureAiLevelAction } from "@/app/actions/ai";
import { EditPanel, type AiTools } from "./edit-panel";
import { CommentComposer, CommentRail, type ClassComment } from "./comment-board";
import { channelName, type ClassMessage, type PresenterCommand } from "./channel";
import { PrintSlides } from "./print-slides";
import { SettingsPanel } from "./settings-panel";
import { SlideView, themeVars } from "./slide-view";

// Settings saved under the old key carry over once (see loadSettings).
const STORAGE_KEY = "ed180-present-v3";
const OLD_STORAGE_KEY = "ced-present-v2";
const IDLE_MS = 3000;
/** The printed slide area in CSS pixels (landscape Letter, less margins and footer). Its legibility floor works out to the 19pt print body size. */
const PRINT_STAGE: Stage = { width: 800, height: 560 };
/** Rounds the measured slide box so tiny resizes do not rebuild the slides. */
const quantize = (n: number) => Math.max(160, Math.round(n / 24) * 24);

function loadSettings(): PresentSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(OLD_STORAGE_KEY);
    if (raw) return parseSettings(JSON.parse(raw));
  } catch { /* storage unavailable or corrupt: use defaults */ }
  return parseSettings(null);
}

export function PresentMode({
  content, exitHref, devotionalId, notesSlot, title, presenterHref, tools, savedVersions, aiLevels,
}: {
  /**
   * Reading levels with no version written by an editor are adapted by AI when chosen and shared
   * by every teacher. `bands` are the ones already adapted (their text is in content.levels).
   */
  aiLevels?: { bands: GradeBand[]; canAdapt: boolean };
  /** Signed-in teachers: editing, saving and AI re-leveling (enabled by plan). */
  tools?: AiTools;
  /** The teacher's saved versions, keyed by reading level ("standard" for the standard text). */
  savedVersions?: Partial<Record<string, Required<LevelVersion>>>;
  content: PresentContent;
  exitHref: string;
  devotionalId: string;
  /** Teacher's private notes editor. Shown only on request, with a warning about mirrored screens. */
  notesSlot?: ReactNode;
  title: string;
  presenterHref: string;
}) {
  const [settings, setSettings] = useState<PresentSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [stageSize, setStageSize] = useState<Stage>({ width: 1152, height: 648 });
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState<"none" | "settings" | "notes" | "edit">("none");
  // The teacher's own text per reading level: saved versions, plus edits shown this session.
  const [overrides, setOverrides] = useState<Partial<Record<string, Required<LevelVersion>>>>(() => ({ ...savedVersions }));
  // Class comments, per slide, for this presentation only: never saved or sent anywhere.
  const [comments, setComments] = useState<Record<string, ClassComment[]>>({});
  const [composing, setComposing] = useState(false);
  const commentId = useRef(0);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(() => new Set(Object.keys(savedVersions ?? {})));
  const [chrome, setChrome] = useState(true);
  const [blank, setBlank] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);
  const channel = useRef<BroadcastChannel | null>(null);

  // Saved settings are read after hydration so the server and first client render agree.
  useEffect(() => {
    setSettings(loadSettings());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  }, [settings, ready]);

  // The size of the slide box decides how much text fits on a slide at a readable size.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const width = quantize(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      const height = quantize(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
      setStageSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reading levels adapted by AI during this visit, and the one being written now.
  const [adapted, setAdapted] = useState<Levels>({});
  const [adapting, setAdapting] = useState<GradeBand | null>(null);
  const [adaptFailed, setAdaptFailed] = useState<Partial<Record<GradeBand, string>>>({});
  const tried = useRef(new Set<GradeBand>());
  const withAdapted = useMemo<PresentContent>(
    () => (Object.keys(adapted).length ? { ...content, levels: { ...adapted, ...content.levels } } : content),
    [content, adapted],
  );
  const adaptedBands = useMemo(() => new Set<GradeBand>([...(aiLevels?.bands ?? []), ...(Object.keys(adapted) as GradeBand[])]), [aiLevels, adapted]);

  // Choosing a level with no text of its own: ask the server to adapt it (about half a minute, once per devotional).
  useEffect(() => {
    const band = settings.band;
    // Grades 6 to 8 read the standard text: it is written at that level, so it is not adapted.
    if (!ready || !band || band === STANDARD_BAND || !aiLevels?.canAdapt || withAdapted.levels[band] || tried.current.has(band)) return;
    tried.current.add(band);
    setAdapting(band);
    void ensureAiLevelAction({ devotionalId, band }).then((result) => {
      setAdapting((b) => (b === band ? null : b));
      if (result.ok) setAdapted((a) => ({ ...a, [band]: result.version }));
      else setAdaptFailed((f) => ({ ...f, [band]: result.error }));
    });
  }, [ready, settings.band, aiLevels?.canAdapt, withAdapted.levels, devotionalId]);

  const bandLabels = useMemo(() => {
    const out: Partial<Record<GradeBand, string>> = {};
    for (const band of BANDS) {
      if (content.levels[band] && !adaptedBands.has(band)) continue; // written by an editor: default label
      if (band === STANDARD_BAND) continue; // the standard text, written at this level
      if (adaptedBands.has(band)) out[band] = "Adapted for this age";
      else if (adapting === band) out[band] = "Writing this level…";
      else if (adaptFailed[band]) out[band] = "Standard text (could not adapt)";
      else if (aiLevels?.canAdapt) out[band] = "Adapted when chosen";
    }
    return out;
  }, [content.levels, adaptedBands, adapting, adaptFailed, aiLevels?.canAdapt]);

  const versionKey = settings.band ?? "standard";
  const effective = useMemo<PresentContent>(() => {
    const content = withAdapted;
    const o = overrides[versionKey];
    if (!o) return content;
    if (settings.band) return { ...content, levels: { ...content.levels, [settings.band]: o } };
    return { ...content, reflection: o.reflection, discussion: o.discussion_question, practice: o.practical_application, prayer: o.prayer };
  }, [withAdapted, overrides, versionKey, settings.band]);
  const slides = useMemo(() => buildSlides(effective, settings, stageSize), [effective, settings, stageSize]);
  const writtenBands = useMemo(() => bandsWithVersion(withAdapted.levels), [withAdapted.levels]);
  const printSlides = useMemo(() => buildSlides(effective, { ...settings, size: 1 }, PRINT_STAGE), [effective, settings]);
  const currentText = useMemo(() => {
    const standard = { reflection: effective.reflection, discussion_question: effective.discussion, practical_application: effective.practice, prayer: effective.prayer };
    const t = settings.band ? textForBand(standard, effective.levels, settings.band) : standard;
    return { reflection: t.reflection, discussion_question: t.discussion_question, practical_application: t.practical_application, prayer: t.prayer };
  }, [effective, settings.band]);

  // When the slide list is rebuilt, stay on the same part of the lesson.
  const lastSlides = useRef(slides);
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (lastSlides.current === slides) return;
    const was = lastSlides.current[Math.min(indexRef.current, lastSlides.current.length - 1)];
    lastSlides.current = slides;
    setIndex(equivalentIndex(was, slides));
  }, [slides]);

  const safeIndex = Math.min(index, Math.max(slides.length - 1, 0));
  const slide = slides[safeIndex];
  const slideComments = (settings.comments && slide ? comments[slide.key] : undefined) ?? [];
  const total = slides.length;

  const go = useCallback((delta: number) => setIndex((i) => Math.min(slides.length - 1, Math.max(0, Math.min(i, slides.length - 1) + delta))), [slides.length]);
  const goTo = useCallback((n: number) => setIndex(Math.min(slides.length - 1, Math.max(0, n))), [slides.length]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    onChange();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Keep the screen awake while presenting, where the browser supports it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === "visible") {
          const l = await nav.wakeLock.request("screen");
          if (cancelled) void l.release(); else lock = l;
        }
      } catch { /* not allowed: carry on */ }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Controls fade away after a few seconds so the slide is all that is left.
  const poke = useCallback(() => {
    setChrome(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setChrome(false), IDLE_MS);
  }, []);
  useEffect(() => {
    poke();
    const events = ["mousemove", "mousedown", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, poke, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, poke);
      window.clearTimeout(idleTimer.current);
    };
  }, [poke]);

  const changeSize = useCallback((delta: number) => setSettings((s) => ({ ...s, size: Math.min(SIZE_SCALES.length - 1, Math.max(0, s.size + delta)) })), []);

  const openPresenter = useCallback(() => {
    window.open(presenterHref, "ed180-presenter", "popup=yes,width=1100,height=760");
  }, [presenterHref]);

  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    window.location.assign(exitHref);
  }, [exitHref]);

  // Keyboard (including slide clickers, which send PageUp / PageDown).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const typing = target?.matches("input[type=text],input[type=search],textarea,select,[contenteditable=true]");
      if (typing) return;
      if (panel === "settings" || panel === "edit") return; // the panel handles its own Escape
      if (e.key === "Escape") {
        if (panel === "notes") setPanel("none");
        else if (!document.fullscreenElement) leave();
        return; // while full screen, the browser's own Escape leaves full screen first
      }
      const onControl = target?.matches("button,a,input,summary");
      switch (e.key) {
        case "ArrowRight": case "PageDown": case "ArrowDown": e.preventDefault(); go(1); break;
        case " ": if (onControl) return; e.preventDefault(); go(1); break;
        case "ArrowLeft": case "PageUp": case "ArrowUp": e.preventDefault(); go(-1); break;
        case "Home": e.preventDefault(); goTo(0); break;
        case "End": e.preventDefault(); goTo(slides.length - 1); break;
        case "+": case "=": changeSize(1); break;
        case "-": case "_": changeSize(-1); break;
        case "f": case "F": toggleFullscreen(); break;
        case "b": case "B": case ".": setBlank((v) => !v); break;
        case "n": case "N": if (notesSlot) setPanel((p) => (p === "notes" ? "none" : "notes")); break;
        case "s": case "S": setPanel("settings"); break;
        case "c": case "C": if (tools && settings.comments) { e.preventDefault(); setComposing(true); } break;
        case "Tab": poke(); return;
        default: return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, goTo, slides.length, panel, leave, toggleFullscreen, changeSize, notesSlot, poke, tools, settings.comments]);

  // Presenter window: this screen reports its state and obeys commands.
  const stateRef = useRef<ClassMessage>({ type: "empty" });
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(channelName(devotionalId));
    channel.current = ch;
    ch.onmessage = (event: MessageEvent<PresenterCommand>) => {
      const m = event.data;
      if (m.type === "hello") ch.postMessage(stateRef.current);
      else if (m.type === "goto") goTo(m.index);
      else if (m.type === "band") setSettings((s) => ({ ...s, band: m.band }));
      else if (m.type === "cmd") {
        if (m.cmd === "next") go(1);
        else if (m.cmd === "prev") go(-1);
        else if (m.cmd === "first") goTo(0);
        else if (m.cmd === "last") goTo(slides.length - 1);
        else setBlank((v) => !v);
      }
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [devotionalId, go, goTo, slides.length]);
  useEffect(() => {
    stateRef.current = slide
      ? { type: "state", index: safeIndex, total, current: slide, next: slides[safeIndex + 1] ?? null, theme: settings.theme, size: settings.size, band: settings.band, writtenBands, bandLabels, blank, stage: stageSize }
      : { type: "empty" };
    channel.current?.postMessage(stateRef.current);
  }, [slide, slides, safeIndex, total, settings.theme, settings.size, settings.band, writtenBands, bandLabels, blank, stageSize]);

  const printNow = useCallback(() => {
    setPanel("none");
    window.setTimeout(() => window.print(), 50);
  }, []);

  const bar = `pointer-events-auto flex items-center gap-2 px-3 py-1.5 transition-opacity duration-200 focus-within:opacity-100 ${chrome || panel !== "none" ? "opacity-100" : "pointer-events-none opacity-0"}`;
  const btn = "inline-flex min-h-10 min-w-10 items-center justify-center rounded-control border border-current/40 px-3 text-base font-semibold hover:bg-current/10 disabled:opacity-40";
  const hasPassageText = Boolean(content.scripture.text);

  return (
    <>
      <div
        ref={root}
        className={`present-stage fixed inset-0 flex flex-col print:hidden ${chrome || panel !== "none" ? "" : "cursor-none"}`}
        style={{ ...themeVars(settings.theme), visibility: ready ? "visible" : "hidden" }}
        data-theme={settings.theme}
        onTouchStart={(e) => { const t = e.touches[0]; touchStart.current = t ? { x: t.clientX, y: t.clientY } : null; }}
        onTouchEnd={(e) => {
          const a = touchStart.current;
          const t = e.changedTouches[0];
          touchStart.current = null;
          if (!a || !t) return;
          const dx = t.clientX - a.x;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(t.clientY - a.y) * 1.5) go(dx < 0 ? 1 : -1);
        }}
      >
        <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2">
          <div className={bar}>
            <Link href={exitHref} onClick={(e) => { e.preventDefault(); leave(); }} className={btn}>← Exit</Link>
            {/* The reading level is chosen once, in settings or the presenter window; this only shows it. */}
            <button type="button" className={`${btn} max-sm:hidden`} onClick={() => setPanel("settings")} aria-label={settings.band ? `Reading level: grades ${BAND_SHORT[settings.band]}. Change in settings.` : "Choose a reading level in settings"}>
              {settings.band ? `Grades ${BAND_SHORT[settings.band]}` : "Choose reading level"}
            </button>
            <span role="status" className="text-sm font-medium max-sm:hidden">
              {adapting ? `Writing the ${adapting === "k2" ? "K–2" : `grades ${BAND_SHORT[adapting]}`} version (about half a minute)…` : ""}
            </span>
          </div>
          <div className={bar}>
            <button type="button" className={`${btn} max-sm:hidden`} aria-label="Smaller text" onClick={() => changeSize(-1)} disabled={settings.size === 0}>A−</button>
            <button type="button" className={`${btn} max-sm:hidden`} aria-label="Larger text" onClick={() => changeSize(1)} disabled={settings.size === SIZE_SCALES.length - 1}>A+</button>
            {tools && settings.comments ? <button type="button" className={btn} onClick={() => setComposing(true)}>Comment</button> : null}
            {tools ? <button type="button" className={`${btn} max-sm:hidden`} onClick={() => setPanel("edit")}>Edit</button> : null}
            {notesSlot ? <button type="button" className={`${btn} max-sm:hidden`} aria-pressed={panel === "notes"} onClick={() => setPanel((p) => (p === "notes" ? "none" : "notes"))}>Notes</button> : null}
            <button type="button" className={btn} onClick={() => setPanel("settings")}>Settings</button>
            <button type="button" className={`${btn} max-sm:hidden`} onClick={toggleFullscreen} aria-pressed={fullscreen}>{fullscreen ? "Exit full screen" : "Full screen"}</button>
          </div>
        </header>

        <main id="main" ref={stage} className={`min-h-0 flex-1 px-[5vw] py-14 ${slideComments.length ? "pr-[31vw]" : ""}`} aria-label={slide ? slide.label : "Presentation"}>
          {slide ? (
            <SlideView slide={slide} size={settings.size} band={settings.band} />
          ) : (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="font-serif text-3xl">No slides to show</p>
                <p className="mt-2">Choose at least one slide in Settings.</p>
                <button type="button" className={`${btn} mt-4`} onClick={() => setPanel("settings")}>Open settings</button>
              </div>
            </div>
          )}
        </main>
        {slideComments.length ? (
          <CommentRail comments={slideComments} onRemove={(id) => slide && setComments((c) => ({ ...c, [slide.key]: (c[slide.key] ?? []).filter((x) => x.id !== id) }))} />
        ) : null}
        {composing && settings.comments ? (
          <CommentComposer
            onClose={() => setComposing(false)}
            onPost={(text, emoji) => {
              if (!slide) return;
              const id = ++commentId.current;
              setComments((c) => ({ ...c, [slide.key]: [...(c[slide.key] ?? []), { id, text, emoji }] }));
            }}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">{slide ? `Slide ${safeIndex + 1} of ${total}: ${slide.label}` : ""}</p>

        <footer className="absolute inset-x-0 bottom-0 z-20">
          <div className={`${bar} justify-between`}>
            <button type="button" className={btn} onClick={() => go(-1)} disabled={safeIndex === 0}>← Back</button>
            {total <= 14 ? (
              <ol className="flex items-center justify-center max-sm:hidden" aria-label="Slides">
                {slides.map((s, i) => (
                  <li key={s.key}>
                    <button type="button" aria-label={`Go to slide ${i + 1}: ${s.label}`} aria-current={i === safeIndex ? "step" : undefined} onClick={() => goTo(i)} className="grid size-9 place-items-center">
                      <span className="block size-3 rounded-full border-2 border-current" style={{ background: i === safeIndex ? "var(--p-accent)" : "transparent", borderColor: i === safeIndex ? "var(--p-accent)" : "currentColor" }} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
            {/* A plain count when there are too many dots to fit, and always on phones. */}
            <p aria-hidden="true" className={`text-lg font-semibold ${total <= 14 ? "sm:hidden" : ""}`}>{safeIndex + 1} / {total}</p>
            <button type="button" className={btn} onClick={() => go(1)} disabled={safeIndex >= total - 1}>Next →</button>
          </div>
        </footer>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: "color-mix(in srgb, var(--p-fg) 15%, transparent)" }}>
          <div className="h-full" style={{ width: total ? `${((safeIndex + 1) / total) * 100}%` : 0, background: "var(--p-accent)" }} />
        </div>

        {blank ? (
          <button type="button" aria-label="Screen is blank. Press any key or click to show the slide." className="fixed inset-0 z-30 cursor-none bg-black" onClick={() => setBlank(false)} />
        ) : null}

        {panel === "notes" && notesSlot ? (
          <aside aria-label="Presenter notes" className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto bg-white p-4 text-[#111]">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold">Presenter notes</h2>
              <button type="button" onClick={() => setPanel("none")} className="min-h-11 rounded-control border border-[#777] px-3 text-sm font-semibold">Close</button>
            </div>
            <p role="note" className="mt-2 rounded-control bg-[#fff3cd] p-3 text-sm font-medium">
              Anyone looking at this screen can read your notes. If it is mirrored to a projector, use the presenter window instead.
            </p>
            <button type="button" onClick={openPresenter} className="mt-3 min-h-11 rounded-control border border-[#777] px-3 text-sm font-semibold">Open presenter window</button>
            <div className="mt-4">{notesSlot}</div>
          </aside>
        ) : null}

        {panel === "edit" && tools ? (
          <EditPanel
            band={settings.band}
            current={currentText}
            saved={savedKeys.has(versionKey)}
            tools={tools}
            onApply={(v) => setOverrides((o) => ({ ...o, [versionKey]: v }))}
            onSaved={(v) => { setOverrides((o) => ({ ...o, [versionKey]: v })); setSavedKeys((k) => new Set(k).add(versionKey)); }}
            onReset={() => {
              setOverrides((o) => { const next = { ...o }; delete next[versionKey]; return next; });
              setSavedKeys((k) => { const next = new Set(k); next.delete(versionKey); return next; });
            }}
            onClose={() => setPanel("none")}
          />
        ) : null}

        {panel === "settings" ? (
          <SettingsPanel
            settings={settings}
            onChange={setSettings}
            onClose={() => setPanel("none")}
            onPrint={printNow}
            hasTheme={Boolean(content.theme)}
            hasPassageText={hasPassageText}
            writtenBands={writtenBands}
            bandLabels={bandLabels}
            allowComments={Boolean(tools)}
            onOpenPresenter={openPresenter}
          />
        ) : null}
      </div>
      <PrintSlides slides={printSlides} title={title} />
    </>
  );
}
