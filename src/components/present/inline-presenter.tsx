"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { DEFAULT_SETTINGS, SIZE_SCALES, buildSlides, equivalentIndex, type PresentContent, type Stage } from "@/lib/content/present";
import { SlideView, themeVars } from "./slide-view";

const quantize = (n: number) => Math.max(160, Math.round(n / 24) * 24);

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

  const safe = Math.min(index, Math.max(0, slides.length - 1));
  const slide = slides[safe];
  const go = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(slides.length - 1, Math.min(i, slides.length - 1) + d))), [slides.length]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.().catch(() => undefined);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).matches("button,a") && e.key === " ") return;
    if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
  };

  const base = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-control border px-3 font-semibold disabled:opacity-40";
  const btn = `${base} border-line-strong/50 bg-surface text-ink hover:bg-brand-soft`;
  const primary = `${base} border-brand bg-brand text-white hover:bg-brand-hover`;

  return (
    <section aria-label="Today’s devotional" className="grid gap-3">
      <div
        ref={box}
        tabIndex={0}
        onKeyDown={onKey}
        aria-roledescription="presentation"
        aria-label={slide ? `Slide ${safe + 1} of ${slides.length}: ${slide.label}. Use the arrow keys to move.` : "Today’s devotional"}
        className={`present-stage relative flex flex-col overflow-hidden focus-visible:outline-4 focus-visible:outline-offset-2 ${
          fullscreen ? "h-dvh w-dvw" : "aspect-video w-full rounded-card border border-line-strong/40 shadow-[0_18px_40px_-24px_rgb(20_32_43/0.45)]"
        }`}
        style={themeVars("white")}
      >
        <div ref={slideArea} className={`min-h-0 flex-1 ${fullscreen ? "px-[5vw] py-14" : "px-[6%] py-[4%]"}`}>
          {slide ? <SlideView slide={slide} size={size} band={null} /> : null}
        </div>
        {fullscreen ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 p-2">
            <button type="button" className={btn} onClick={() => go(-1)} disabled={safe === 0}>← Back</button>
            <span className="font-semibold tabular-nums">{safe + 1} / {slides.length}</span>
            <span className="flex gap-2">
              <button type="button" className={btn} onClick={toggleFullscreen}>Exit full screen</button>
              <button type="button" className={btn} onClick={() => go(1)} disabled={safe >= slides.length - 1}>Next →</button>
            </span>
          </div>
        ) : null}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1" style={{ background: "color-mix(in srgb, var(--p-fg) 12%, transparent)" }}>
          <div className="h-full" style={{ width: `${((safe + 1) / Math.max(1, slides.length)) * 100}%`, background: "var(--p-accent)" }} />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">{slide ? `Slide ${safe + 1} of ${slides.length}: ${slide.label}` : ""}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => go(-1)} disabled={safe === 0}>← Back</button>
        <button type="button" className={btn} onClick={() => go(1)} disabled={safe >= slides.length - 1}>Next →</button>
        <span className="px-1 text-sm font-semibold text-muted tabular-nums">Slide {safe + 1} of {slides.length}</span>
        <span className="ml-auto flex gap-2">
          <button type="button" className={btn} aria-label="Smaller text" onClick={() => setSize((s) => Math.max(0, s - 1))} disabled={size === 0}>A−</button>
          <button type="button" className={btn} aria-label="Larger text" onClick={() => setSize((s) => Math.min(SIZE_SCALES.length - 1, s + 1))} disabled={size === SIZE_SCALES.length - 1}>A+</button>
          <button type="button" className={primary} onClick={toggleFullscreen}>
            <Icon name="expand" size={18} /> Present full screen
          </button>
        </span>
      </div>
      <p className="text-sm text-muted">
        <Icon name="shield" size={14} className="mr-1 inline align-[-2px]" />
        Reading levels for K–2 to 9–12, presenter notes and editing are for signed-in teachers.{" "}
        <Link href="/login" className="font-semibold text-brand underline">Sign in</Link>
      </p>
    </section>
  );
}
