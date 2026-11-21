import { Icon } from "@/components/ui/icon";

/**
 * Static illustration of classroom mode on the landing page, drawn the way the
 * real Scripture slide is: reference first, then the passage. It is not
 * interactive and is labelled as a preview.
 */
export function ClassroomPreview() {
  return (
    <figure className="on-dark overflow-hidden rounded-card border border-night-raised bg-night text-parchment shadow-[0_24px_48px_-28px_rgb(20_32_43/0.7)]">
      <div className="flex items-center justify-between gap-3 border-b border-night-raised px-4 py-3 text-sm text-[#c9d3dc]">
        <span>Present to class · Grades 3–5</span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="x" size={16} /> Esc to exit
        </span>
      </div>
      <div className="px-6 py-10 md:px-12 md:py-14">
        <p className="font-serif text-xl font-semibold text-mint md:text-2xl">Galatians 6:9</p>
        <blockquote className="mt-3 font-serif text-3xl leading-snug text-pretty md:text-4xl md:leading-[1.3]">
          And let us not be weary in well doing: for in due season we shall reap, if we faint not.
        </blockquote>
        <p className="mt-6 text-sm text-[#c9d3dc]">King James Version (KJV), public domain in the United States.</p>
      </div>
      <figcaption className="border-t border-night-raised px-4 py-3 text-xs text-[#c9d3dc]">
        Illustration of classroom mode with sample Scripture; not a live devotional.
      </figcaption>
    </figure>
  );
}
