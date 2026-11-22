"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { DEFAULT_SETTINGS, SIZE_SCALES, buildSlides, equivalentIndex, type PresentContent, type SectionId, type Stage } from "@/lib/content/present";
import { SlideView, themeVars } from "./slide-view";

const quantize = (n: number) => Math.max(160, Math.round(n / 24) * 24);

/** The four steps of every lesson, and the parts of the devotional each one covers. */
const STEPS: Array<{ label: string; icon: IconName; sections: SectionId[] }> = [
  { label: "Read", icon: "book", sections: ["scripture", "reflection"] },
  { label: "Talk", icon: "chat", sections: ["discussion"] },
  { label: "Do", icon: "target", sections: ["practice"] },
  { label: "Pray", icon: "pray", sections: ["prayer"] },
];

/**
 * Today's devotional, presentable straight from the home page without signing
 * in: the standard text, Back and Next, text size and full screen. Reading
 * levels, notes, the presenter window and editing are for signed-in teachers.
 */
export function InlinePresenter({ content }: { content: PresentContent }) {
  const box = useRef<HTMLDivElement>(null);
  const slideArea = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>({ width: 960, height: 540 });
  const [index, setIndex] = useState(0);
  const [size, setSize] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const el = slideArea.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const width = quantize(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
      const height = quantize(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
      setStage((p) => (p.width === width && p.height === height ? p : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, size }), [size]);
  const slides = useMemo(() => buildSlides(content, settings, stage), [content, settings, stage]);

  // Stay on the same part of the lesson when the slides are rebuilt (resize, text size).
  const last = useRef(slides);
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (last.current === slides) return;
    const was = last.current[Math.min(indexRef.current, last.current.length - 1)];
    last.current = slides;
    setIndex(equivalentIndex(was, slides));
  }, [slides]);

  // The page already shows the title above, so the inline view opens on the Scripture; Back still reaches the title slide.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || slides.length === 0) return;
    opened.current = true;
    const scripture = slides.findIndex((s) => s.section === "scripture");
    if (scripture > 0) setIndex(scripture);
  }, [slides]);

  const safe = Math.min(index, Math.max(0, slides.length - 1));
  const slide = slides[safe];
  const go = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(slides.length - 1, Math.min(i, slides.length - 1) + d))), [slides.length]);

  // Full screen: the browser's own where it allows it; otherwise (iPhone, and some tablets and
  // in-app browsers) the presenter fills the screen itself, which looks the same to the class.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const onChange = () => {
      const d = document as Document & { webkitFullscreenElement?: Element | null };
      setFullscreen((d.fullscreenElement ?? d.webkitFullscreenElement) === box.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  // While filling the screen, the page behind must not scroll.
  useEffect(() => {
    if (!filled) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    box.current?.focus();
    return () => { root.style.overflow = before; };
  }, [filled]);
  const toggleFullscreen = () => {
    const d = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
    if (filled) { setFilled(false); return; }
    if (d.fullscreenElement ?? d.webkitFullscreenElement) {
      void (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.());
      return;
    }
    const el = box.current as (HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> | void }) | null;
    if (!el) return;
    const request = el.requestFullscreen ? () => el.requestFullscreen() : el.webkitRequestFullscreen ? () => el.webkitRequestFullscreen!() : null;
    if (!request) { setFilled(true); return; }
    try {
      void Promise.resolve(request()).catch(() => setFilled(true));
    } catch {
      setFilled(true);
    }
  };
  const showFull = fullscreen || filled;

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("button,a") && e.key === " ") return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else if (e.key === "Escape" && filled) setFilled(false);
  };

  const base = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control border px-3 font-semibold transition-colors disabled:opacity-40";
  const btn = `${base} border-[#b8c6ea] bg-surface text-brand hover:border-brand hover:bg-brand-soft`;
  const primary = `${base} border-brand bg-brand text-white shadow-[0_2px_6px_-1px_rgb(35_80_204/0.45)] hover:bg-brand-hover`;

  // Which lesson step the slide on screen belongs to; the opener belongs to none.
  const stepOf = (sections: readonly SectionId[]) => STEPS.findIndex((st) => st.sections.some((x) => sections.includes(x)));
  const currentStep = slide ? stepOf(slide.sections) : -1;
  const jump = (step: number) => {
    const at = slides.findIndex((sl) => stepOf(sl.sections) === step);
    if (at >= 0) setIndex(at);
  };

  return (
    <section aria-label="Today’s devotional" className="grid gap-4">
      {/* The lesson's four steps. Each jumps to that part of the devotional; the current one is highlighted. */}
      <nav aria-label="Lesson steps">
        <ol className="grid grid-cols-4 gap-1.5 rounded-control bg-parchment p-1.5 sm:gap-2">
          {STEPS.map((st, i) => {
            const here = i === currentStep;
            const done = currentStep > i;
            return (
              <li key={st.label}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  aria-current={here ? "step" : undefined}
                  className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-[0.5rem] px-2 text-sm font-semibold transition-colors sm:text-base ${
                    here ? "bg-surface text-brand shadow-card" : "text-muted hover:bg-surface/70 hover:text-ink"
                  }`}
                >
                  <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums max-sm:hidden ${here ? "bg-brand text-white" : done ? "bg-gilt text-ink" : "bg-line text-muted"}`}>
                    {done ? <Icon name="check" size={14} /> : i + 1}
                  </span>
                  <Icon name={st.icon} size={18} className="sm:hidden" />
                  {st.label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div
        ref={box}
        tabIndex={0}
        onKeyDown={onKey}
        aria-roledescription="presentation"
        aria-label={slide ? `Slide ${safe + 1} of ${slides.length}: ${slide.label}. Use the arrow keys to move.` : "Today’s devotional"}
        className={`present-stage flex flex-col overflow-hidden focus-visible:outline-4 focus-visible:outline-offset-2 ${
          filled ? "fixed inset-0 z-[100] h-dvh w-dvw" : fullscreen ? "relative h-dvh w-dvw" : "relative aspect-video w-full rounded-card border border-line shadow-card"
        }`}
        style={themeVars("white")}
      >
        <div ref={slideArea} className={`min-h-0 flex-1 ${showFull ? "px-[5vw] pb-20 pt-[max(1.5rem,env(safe-area-inset-top))] sm:py-14" : "px-[6%] py-[4%]"}`}>
          {slide ? <SlideView slide={slide} size={size} band={null} /> : null}
        </div>
        {showFull ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button type="button" className={btn} onClick={() => go(-1)} disabled={safe === 0}>Back</button>
            <span className="font-semibold tabular-nums">{safe + 1} / {slides.length}</span>
            <span className="flex gap-2">
              <button type="button" className={btn} onClick={toggleFullscreen}>Exit full screen</button>
              <button type="button" className={btn} onClick={() => go(1)} disabled={safe >= slides.length - 1}>Next</button>
            </span>
          </div>
        ) : null}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ background: "color-mix(in srgb, var(--p-fg) 12%, transparent)" }}>
          <div className="h-full" style={{ width: `${((safe + 1) / Math.max(1, slides.length)) * 100}%`, background: "var(--p-accent)" }} />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{slide ? `Slide ${safe + 1} of ${slides.length}: ${slide.label}` : ""}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => go(-1)} disabled={safe === 0}>Back</button>
        <button type="button" className={btn} onClick={() => go(1)} disabled={safe >= slides.length - 1}>Next</button>
        <span className="px-1 text-sm text-muted tabular-nums">Slide {safe + 1} of {slides.length}</span>
        <span className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <button type="button" className={btn} aria-label="Smaller text" onClick={() => setSize((s) => Math.max(0, s - 1))} disabled={size === 0}>A−</button>
          <button type="button" className={btn} aria-label="Larger text" onClick={() => setSize((s) => Math.min(SIZE_SCALES.length - 1, s + 1))} disabled={size === SIZE_SCALES.length - 1}>A+</button>
          <button type="button" id="present-today" className={`${primary} max-sm:flex-1`} onClick={toggleFullscreen}>
            <Icon name="expand" size={18} /> Present full screen
          </button>
        </span>
      </div>
      <p className="text-sm text-muted">
        Reading levels for K–2 to 9–12, presenter notes and editing are for signed-in teachers.{" "}
        <Link href="/login" className="font-semibold text-brand underline">Sign in</Link>
      </p>
    </section>
  );
}
