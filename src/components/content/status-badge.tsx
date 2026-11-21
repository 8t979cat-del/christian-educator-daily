import { cn } from "@/lib/cn";
import { STATUS_LABELS, type DevotionalStatus } from "@/lib/content/options";

const STYLES: Record<DevotionalStatus, string> = {
  draft: "bg-line/60 text-ink",
  in_review: "bg-[#fdf0cf] text-[#6b4300]",
  approved: "bg-[#dcefe0] text-[#1b4d27]",
  scheduled: "bg-[#e1eaf8] text-[#1f3f73]",
  published: "bg-brand text-white",
  archived: "bg-line/60 text-muted",
};

/** Status is always spelled out, so colour is never the only signal. */
export function StatusBadge({ status, className }: { status: DevotionalStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-control px-3 py-1 text-xs font-semibold", STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}
