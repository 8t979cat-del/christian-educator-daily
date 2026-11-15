"use client";

import type { CSSProperties } from "react";
import { RichTextView } from "@/components/content/rich-text-view";
import { PRESENT_THEMES, SIZE_SCALES, type Slide, type ThemeId } from "@/lib/content/present";
import { FitText } from "./fit-text";

export function themeVars(theme: ThemeId): CSSProperties {
  const t = PRESENT_THEMES[theme];
  return { "--p-bg": t.bg, "--p-fg": t.fg, "--p-accent": t.accent, "--p-muted": t.muted, background: t.bg, color: t.fg } as CSSProperties;
}

const accent: CSSProperties = { color: "var(--p-accent)" };
const muted: CSSProperties = { color: "var(--p-muted)" };

/** One slide, filling whatever box it is placed in. Used full screen, in the presenter window, and as the "next slide" preview. */
export function SlideView({ slide, size, simple }: { slide: Slide; size: number; simple: boolean }) {
  const scale = (SIZE_SCALES[size] ?? 1) * (simple ? 1.15 : 1);
  const b = slide.body;
  const fitKey = `${slide.key}|${size}|${simple}`;
  const eyebrow = "font-semibold uppercase tracking-[0.12em] text-[0.45em]";

  switch (b.kind) {
    case "theme":
      return (
        <FitText fitKey={fitKey} scale={scale} ratio={1.25}>
          <div className="mx-auto max-w-[22em] text-center">
            <p className={eyebrow} style={accent}>{b.eyebrow}{b.dayLabel && !simple ? ` · ${b.dayLabel}` : ""}</p>
            <h1 className="mt-[0.5em] font-serif font-semibold leading-[1.1]">{b.heading}</h1>
            {b.text ? <p className="mt-[0.7em] text-[0.55em] leading-snug" style={muted}>{b.text}</p> : null}
          </div>
        </FitText>
      );
    case "title":
      return (
        <FitText fitKey={fitKey} scale={scale} ratio={1.3}>
          <div className="mx-auto max-w-[22em] text-center">
            <p className={eyebrow} style={accent}>{b.eyebrow}</p>
            <h1 className="mt-[0.5em] font-serif font-semibold leading-[1.1]">{b.heading}</h1>
            {b.text ? <p className="mt-[0.7em] text-[0.55em] leading-snug" style={muted}>{b.text}</p> : null}
          </div>
        </FitText>
      );
    case "scripture":
      return (
        <FitText fitKey={fitKey} scale={scale} align="center">
          <figure className="mx-auto max-w-[40em]">
            {slide.pageCount > 1 ? <p className={`${eyebrow} mb-[0.8em]`} style={muted}>{slide.page + 1} of {slide.pageCount}</p> : null}
            <blockquote className="font-serif leading-[1.4] [text-wrap:pretty]">
              {b.text.split("\n").map((line, i) => (
                <span key={i} className={i === 0 ? "block" : "mt-[0.3em] block"}>{line}</span>
              ))}
            </blockquote>
            {b.reference || b.translation ? (
              <figcaption className="mt-[0.9em] text-[0.5em] font-semibold uppercase tracking-[0.1em]" style={accent}>
                {[b.reference, b.translation].filter(Boolean).join(" · ")}
              </figcaption>
            ) : null}
            {b.notice ? <p className="mt-[0.5em] text-[max(12px,0.4em)] leading-snug" style={muted}>{b.notice}</p> : null}
          </figure>
        </FitText>
      );
    case "reference":
      return (
        <FitText fitKey={fitKey} scale={scale} ratio={1.2}>
          <div className="mx-auto max-w-[22em] text-center">
            <p className={eyebrow} style={accent}>{simple ? "Let’s read God’s Word" : "Scripture"}</p>
            <h1 className="mt-[0.5em] font-serif font-semibold leading-[1.1]">{b.reference}</h1>
            {b.translation ? <p className="mt-[0.4em] text-[0.5em]" style={muted}>{b.translation}</p> : null}
            <p className="mt-[0.9em] text-[0.55em] leading-snug" style={muted}>Open your Bible and read this passage together.</p>
          </div>
        </FitText>
      );
    case "rich":
      return (
        <FitText fitKey={fitKey} scale={scale} ratio={b.emphasis ? 1.15 : 1} align="center">
          <div className={`mx-auto ${b.emphasis ? "max-w-[26em] text-center" : "max-w-[34em]"}`}>
            <h1 className={`${eyebrow} mb-[0.9em]`} style={accent}>
              {b.heading}{slide.pageCount > 1 ? ` · ${slide.page + 1} of ${slide.pageCount}` : ""}
            </h1>
            <RichTextView doc={b.doc} className={b.emphasis ? "font-serif font-semibold [text-wrap:balance]" : "[text-wrap:pretty]"} />
          </div>
        </FitText>
      );
  }
}
