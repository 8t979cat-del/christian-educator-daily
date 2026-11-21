import type { AiQuota } from "@/lib/ai/devotional-ai";

/** A small count of the teacher's AI requests left today. */
/** Limits this high mean "no limit" (platform administrators). */
export const isUnlimited = (quota: AiQuota) => quota.limit >= 1_000_000_000;

export function AiCounter({ quota }: { quota: AiQuota }) {
  const out = !isUnlimited(quota) && quota.remaining <= 0;
  return (
    <p
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
        out ? "border-[#b3261e]/40 bg-[#fbeae8] text-[#8a1c14]" : "border-[#1c2a47]/30 bg-[#e7e9ef] text-[#1c2a47]"
      }`}
      aria-live="polite"
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${out ? "bg-[#b3261e]" : "bg-[#1c2a47]"}`} />
      {isUnlimited(quota)
        ? "Unlimited AI requests"
        : out ? `No AI requests left today (limit ${quota.limit})` : `${quota.remaining} of ${quota.limit} AI requests left today`}
    </p>
  );
}

export const OUT_OF_REQUESTS = (limit: number) => `You have used today’s ${limit} AI requests. They reset at midnight UTC (7 or 8 pm US Eastern).`;
