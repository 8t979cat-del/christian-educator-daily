"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Shows its children as large as will fit the box, up to a size set by `scale`
 * and `ratio`. Used for every slide so that text fills the screen without ever
 * running off it. If text would need to go below the minimum readable size it
 * scrolls instead and sets data-overflow, which the slide splitting is meant to
 * prevent (and which the classroom tests check for).
 */
export function FitText({
  children, fitKey, scale, ratio = 1, className = "", align = "center",
}: {
  children: ReactNode;
  /** Re-fit when this changes (the content, basically). */
  fitKey: string;
  scale: number;
  /** Multiplies the largest size tried; display slides use more than 1. */
  ratio?: number;
  className?: string;
  align?: "center" | "start";
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  const fit = useCallback(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const w = o.clientWidth;
    const h = o.clientHeight;
    if (!w || !h) return;
    const max = Math.min(w * 0.065, h * 0.14) * scale * ratio;
    const min = Math.max(16, Math.min(w, h) * 0.03);
    const fits = (px: number) => {
      i.style.fontSize = `${px}px`;
      return i.scrollHeight <= o.clientHeight + 1 && i.scrollWidth <= o.clientWidth + 1;
    };
    let lo = min;
    let hi = Math.max(max, min);
    if (fits(hi)) {
      lo = hi;
    } else {
      for (let n = 0; n < 10; n++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    }
    const ok = fits(lo);
    o.dataset.overflow = ok ? "false" : "true";
    o.style.overflowY = ok ? "hidden" : "auto";
    o.dataset.fontPx = String(Math.round(lo));
  }, [scale, ratio]);

  useLayoutEffect(() => {
    fit();
  }, [fit, fitKey]);

  useLayoutEffect(() => {
    const o = outer.current;
    if (!o) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(o);
    void document.fonts?.ready.then(fit);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fit]);

  return (
    <div ref={outer} data-fit="" className={`flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden ${className}`}>
      <div ref={inner} className={`w-full ${align === "center" ? "m-auto" : "mb-auto mt-0"}`}>
        {children}
      </div>
    </div>
  );
}
