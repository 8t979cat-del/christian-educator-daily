"use client";

import { Icon } from "@/components/ui/icon";
import { MAX_TOPICS, START_TOPICS, TOPIC_WEB } from "@/lib/content/topic-web";

/**
 * A web of topics. The focused topic sits in the middle with its related topics
 * around it; choosing one adds it to the devotional and moves the web to it, so
 * a teacher follows a thread ("Courage" → "Fear and worry" → "Prayer").
 */
export function TopicMap({
  focus, selected, onFocus, onToggle,
}: {
  focus: string | null;
  selected: string[];
  onFocus: (topic: string | null) => void;
  onToggle: (topic: string) => void;
}) {
  const around = focus ? TOPIC_WEB[focus] ?? [] : START_TOPICS;
  const full = selected.length >= MAX_TOPICS;

  // Positions on a circle, as percentages of the square map; the first node at the top.
  const points = around.map((_, i) => {
    const angle = (i / around.length) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(angle) * 36, y: 50 + Math.sin(angle) * 36 };
  });

  const choose = (topic: string) => {
    if (!selected.includes(topic) && full) return;
    if (!selected.includes(topic)) onToggle(topic);
    onFocus(topic);
  };

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
        <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          {points.map((p, i) => (
            <line key={around[i]} x1="50" y1="50" x2={p.x} y2={p.y} stroke="currentColor" strokeWidth="0.35" className="text-line-strong/40" />
          ))}
          <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="1 1.5" className="text-line-strong/30" />
        </svg>

        <div className="absolute left-1/2 top-1/2 w-[34%] -translate-x-1/2 -translate-y-1/2 text-center">
          {focus ? (
            <div className="grid justify-items-center gap-1">
              <span className="rounded-full bg-brand px-4 py-3 font-serif text-lg font-semibold leading-tight text-white shadow-[0_10px_24px_-14px_rgb(20_32_43/0.6)] sm:text-xl">
                {focus}
              </span>
              <button type="button" onClick={() => onFocus(null)} className="min-h-11 px-2 text-sm font-semibold text-brand underline">
                Back to the start
              </button>
            </div>
          ) : (
            <p className="font-serif text-lg font-semibold leading-snug text-ink">Choose a topic to begin</p>
          )}
        </div>

        <ul aria-label={focus ? `Topics related to ${focus}` : "Topics"}>
          {around.map((topic, i) => {
            const on = selected.includes(topic);
            const p = points[i]!;
            return (
              <li key={topic} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && full}
                  onClick={() => choose(topic)}
                  className={`min-h-11 max-w-[9.5rem] rounded-full border-2 px-3 py-1.5 text-center text-sm font-semibold leading-tight transition-colors disabled:opacity-40 sm:text-base ${
                    on ? "border-brand bg-brand-soft text-brand" : "border-line-strong/40 bg-surface text-ink hover:border-brand"
                  }`}
                >
                  {on ? <Icon name="check" size={14} className="mr-1 inline align-[-1px]" /> : null}
                  {topic}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-2 text-center text-sm text-muted">
        Choosing a topic adds it and shows topics related to it. {full ? `That is the most (${MAX_TOPICS}); remove one to add another.` : `Choose up to ${MAX_TOPICS}.`}
      </p>
    </div>
  );
}
