"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { channelName, type ClassMessage, type PresenterCommand } from "./channel";
import { SlideView, themeVars } from "./slide-view";

const BTN = "min-h-11 min-w-11 rounded-md border border-[#777] bg-white px-4 text-base font-semibold hover:bg-[#e3efec] disabled:opacity-40";

/**
 * The teacher's window: the current slide, the next one, notes and a timer.
 * Keep this on the laptop and put the class screen on the projector.
 */
export function PresenterView({ devotionalId, notesSlot, title }: { devotionalId: string; notesSlot?: ReactNode; title: string }) {
  const [state, setState] = useState<ClassMessage | null>(null);
  const [seconds, setSeconds] = useState(0);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(channelName(devotionalId));
    channel.current = ch;
    ch.onmessage = (event: MessageEvent<ClassMessage>) => setState(event.data);
    ch.postMessage({ type: "hello" } satisfies PresenterCommand);
    return () => ch.close();
  }, [devotionalId]);

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const send = (m: PresenterCommand) => channel.current?.postMessage(m);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.matches("input,textarea,select,[contenteditable=true]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !(e.target as HTMLElement).matches("button"))) { e.preventDefault(); send({ type: "cmd", cmd: "next" }); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); send({ type: "cmd", cmd: "prev" }); }
      else if (e.key === "b" || e.key === "B") send({ type: "cmd", cmd: "blank" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const live = state?.type === "state" ? state : null;

  return (
    <div className="min-h-dvh bg-[#f7f5f0] p-4 text-[#1f2a37]">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Presenter window</h1>
          <p className="text-sm text-[#4a5663]">{title}</p>
        </div>
        <p className="font-mono text-2xl" aria-label={`Elapsed time ${mm} minutes ${ss} seconds`}>{mm}:{ss}</p>
      </header>

      {!live ? (
        <p role="status" className="mx-auto mt-10 max-w-xl rounded-lg border border-[#e2ded3] bg-white p-6 text-center text-lg">
          Waiting for the class screen. Open “Present to class” in another window on this computer, and this window will follow it.
        </p>
      ) : (
        <div className="mx-auto mt-4 grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section aria-label="Current slide">
            <div className="present-stage aspect-video overflow-hidden rounded-lg border border-[#6b7480] p-[4%]" style={themeVars(live.theme)}>
              <SlideView slide={live.current} size={live.size} simple={live.simple} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" className={BTN} onClick={() => send({ type: "cmd", cmd: "prev" })} disabled={live.index === 0}>← Back</button>
              <button type="button" className={BTN} onClick={() => send({ type: "cmd", cmd: "next" })} disabled={live.index >= live.total - 1}>Next →</button>
              <button type="button" className={BTN} aria-pressed={live.blank} onClick={() => send({ type: "cmd", cmd: "blank" })}>{live.blank ? "Show screen" : "Blank screen"}</button>
              <p className="ml-auto text-sm font-semibold" aria-live="polite">Slide {live.index + 1} of {live.total} · {live.current.label}</p>
            </div>
          </section>
          <section aria-label="Next slide" className="grid content-start gap-4">
            <div>
              <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-[#1f5a55]">Up next</h2>
              {live.next ? (
                <div aria-hidden="true" className="present-stage aspect-video overflow-hidden rounded-lg border border-[#6b7480] p-[4%]" style={themeVars(live.theme)}>
                  <SlideView slide={live.next} size={live.size} simple={live.simple} />
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-[#6b7480] p-6 text-center">This is the last slide.</p>
              )}
            </div>
            {notesSlot ? <div><h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-[#1f5a55]">My notes</h2>{notesSlot}</div> : null}
          </section>
        </div>
      )}
    </div>
  );
}
