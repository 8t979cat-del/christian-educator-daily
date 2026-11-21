"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { RichTextView } from "@/components/content/rich-text-view";
import type { GradeBand } from "@/lib/content/levels";
import { PRESENT_THEMES, SIZE_SCALES, bandScale, isYoungest, type Slide, type Stage, type ThemeId } from "@/lib/content/present";
import { FitText } from "./fit-text";

export function themeVars(theme: ThemeId): CSSProperties {
  const t = PRESENT_THEMES[theme];
  return { "--p-bg": t.bg, "--p-fg": t.fg, "--p-accent": t.accent, "--p-muted": t.muted, background: t.bg, color: t.fg } as CSSProperties;
}

const accent: CSSProperties = { color: "var(--p-accent)" };
const muted: CSSProperties = { color: "var(--p-muted)" };

/** One slide, filling whatever box it is placed in. Used full screen, in the presenter window, and as the "next slide" preview. */
export function SlideView({ slide, size, band }: { slide: Slide; size: number; band: GradeBand | null }) {
  const simple = isYoungest(band);
  const scale = (SIZE_SCALES[size] ?? 1) * bandScale(band);
  const b = slide.body;
  const fitKey = `${slide.key}|${size}|${band}`;
  // Section labels: sentence case, never letter-spaced capitals, so early readers can read them too.
  const label_ = "font-serif italic text-[0.58em] leading-tight";

  // A passage or section that runs on to the next slide says so, as a printed page would.
  const continues = slide.page < slide.pageCount - 1;

  switch (b.kind) {
    case "opener":
      return (
        <FitText fitKey={fitKey} scale={scale} ratio={1.3}>
          <div className="mx-auto max-w-[22em] text-center">
            <h1 className="font-serif font-semibold leading-[1.1] [text-wrap:balance]">{b.heading}</h1>
            {b.text ? <p className="mt-[0.6em] text-[0.55em] leading-snug [text-wrap:balance]" style={muted}>{b.text}</p> : null}
            {b.theme || b.dayLabel ? (
              <p className="mt-[1.4em] text-[0.42em] italic" style={accent}>
                {[b.theme, simple ? null : b.dayLabel].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </FitText>
      );
    case "scripture": {
      // Later pages say "continued" rather than "2 of 3": the controls already count slides.
      const label = slide.page > 0 ? `${b.reference ?? "Scripture"}, continued` : b.reference;
      return (
        <FitText fitKey={fitKey} scale={scale} align="center">
          <figure className="mx-auto max-w-[36em]">
            {/* The reference leads: it is what the teacher says aloud before reading. */}
            {label || continues ? (
              <figcaption className="mb-[0.4em] flex items-baseline justify-between gap-[1em]">
                <span className="font-serif text-[0.75em] font-semibold leading-tight" style={accent}>{label}</span>
                {continues ? <ContinuesNote /> : null}
              </figcaption>
            ) : null}
            <blockquote className="font-serif leading-[1.38] [text-wrap:pretty]">
              {b.text.split("\n").map((line, i) => {
                const verse = /^(\d{1,3})\s+(.*)$/.exec(line);
                return (
                  <span key={i} className={i === 0 ? "block" : "mt-[0.22em] block"}>
                    {verse ? (
                      <>
                        <sup className="align-[0.45em] text-[0.55em] leading-none" style={accent}>{verse[1]}</sup>
                        {/* A real space, so copied text and screen readers get "1 The", not "1The". */}
                        {" "}{verse[2]}
                      </>
                    ) : line}
                  </span>
                );
              })}
            </blockquote>
            {b.translation || b.notice ? (
              <p className="mt-[0.7em] text-[max(14px,0.38em)] leading-snug" style={muted}>
                {/* Most notices already name the translation; don't say it twice. */}
                {b.notice && b.translation && b.notice.startsWith(b.translation.replace(/\s*\(.*$/, "")) ? b.notice : [b.translation, b.notice].filter(Boolean).join(". ")}
              </p>
            ) : null}
          </figure>
        </FitText>
      );
    }
    case "reference":
      return (
        <FitText fitKey={fitKey} scale={scale} ratio={1.2}>
          <div className="mx-auto max-w-[22em] text-center">
            <h1 className="font-serif font-semibold leading-[1.1]">{b.reference}</h1>
            {b.translation ? <p className="mt-[0.4em] text-[0.5em]" style={muted}>{b.translation}</p> : null}
            <p className="mt-[1em] text-[0.55em] leading-snug" style={accent}>
              {simple ? "Let’s open our Bibles and read it together." : "Open your Bible and read this passage together."}
            </p>
          </div>
        </FitText>
      );
    case "rich":
      return (
        <FitText fitKey={fitKey} scale={scale} ratio={b.emphasis ? 1.15 : 1} align="center">
          <div className={`mx-auto grid gap-[1.3em] ${b.emphasis ? "max-w-[26em] text-center" : "max-w-[34em]"}`}>
            {b.parts.map((part, i) => (
              <section key={part.section}>
                {/* One heading level for every section label, so a slide with two parts reads as two sections. */}
                <div className="mb-[0.6em] flex items-baseline justify-between gap-[1em]">
                  <h2 className={label_} style={accent}>
                    {part.heading}{i === 0 && slide.page > 0 ? ", continued" : ""}
                  </h2>
                  {i === 0 && continues ? <ContinuesNote /> : null}
                </div>
                <RichTextView doc={part.doc} className={b.emphasis ? "font-serif font-semibold [text-wrap:balance]" : "[text-wrap:pretty]"} />
              </section>
            ))}
          </div>
        </FitText>
      );
  }
}

/** The note on a page whose text runs on to the next slide. */
function ContinuesNote() {
  return <span className="shrink-0 font-serif text-[max(12px,0.42em)] italic" style={muted}>continues on the next slide</span>;
}

/**
 * A true miniature of the class screen: the slide is laid out at the class
 * screen's own size, then scaled down, so the preview shows exactly what the
 * room sees instead of re-fitting the text into a small box.
 */
export function SlideThumb({ slide, size, band, theme, stage }: { slide: Slide; size: number; band: GradeBand | null; theme: ThemeId; stage: Stage }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  // The class screen's margin around the slide, so the miniature has the same breathing room.
  const pad = Math.round(stage.height * 0.06);
  const outerW = stage.width + pad * 2;
  const outerH = stage.height + pad * 2;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / outerW);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [outerW]);
  return (
    <div ref={box} className="present-stage relative w-full overflow-hidden rounded-control border border-[#6b7480]" style={{ ...themeVars(theme), aspectRatio: `${outerW} / ${outerH}` }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: outerW, height: outerH, padding: pad, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}>
        <SlideView slide={slide} size={size} band={band} />
      </div>
    </div>
  );
}
