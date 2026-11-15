import { Icon } from "@/components/ui/icon";

/**
 * Static illustration of classroom mode on the landing page. It shows the
 * intended look only; it is not interactive and is labelled as a preview.
 */
export function ClassroomPreview() {
  return (
    <figure className="on-dark overflow-hidden rounded-card border border-night-raised bg-night text-parchment shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-night-raised px-4 py-3 text-sm text-[#B8C4CF]">
        <span>Class mode</span>
        <span className="rounded-full bg-night-raised px-3 py-1 text-xs font-semibold text-white">Scripture</span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="x" size={16} /> Esc to exit
        </span>
      </div>
      <div className="px-6 py-10 md:px-12 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-mint md:text-base">Galatians 6:9 · KJV</p>
        <blockquote className="mt-4 font-serif text-3xl leading-snug md:text-5xl md:leading-snug">
          And let us not be weary in well doing: for in due season we shall reap, if we faint not.
        </blockquote>
      </div>
      <figcaption className="border-t border-night-raised px-4 py-3 text-xs text-[#B8C4CF]">
        Illustrative preview of classroom mode. Sample Scripture text; not a live devotional.
      </figcaption>
    </figure>
  );
}
