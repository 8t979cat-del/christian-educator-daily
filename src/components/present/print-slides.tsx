import { RichTextView } from "@/components/content/rich-text-view";
import type { Slide } from "@/lib/content/present";

/**
 * The slides as printable pages, one per landscape page, black on white.
 * Hidden on screen. "Print / Save as PDF" and Ctrl+P both use it.
 */
export function PrintSlides({ slides, title }: { slides: Slide[]; title: string }) {
  return (
    <div className="print-slides hidden bg-white text-black print:block">
      {slides.map((slide, i) => {
        const b = slide.body;
        return (
          <section key={slide.key} className="print-slide flex min-h-[7in] flex-col justify-between" data-print-slide="">
            <div className="m-auto w-full max-w-[9in] py-6 text-[24pt] leading-[1.4]">
              {b.kind === "opener" ? (
                <div className="text-center">
                  <h1 className="font-serif text-[40pt] font-semibold leading-tight">{b.heading}</h1>
                  {b.text ? <p className="mt-4 text-[18pt]">{b.text}</p> : null}
                  {b.theme || b.dayLabel ? <p className="mt-6 text-[13pt] font-bold">{[b.theme, b.dayLabel].filter(Boolean).join(" · ")}</p> : null}
                </div>
              ) : b.kind === "scripture" ? (
                <figure>
                  <blockquote className="font-serif">
                    {b.text.split("\n").map((line, i) => (
                      <span key={i} className={i === 0 ? "block" : "mt-[0.3em] block"}>{line}</span>
                    ))}
                  </blockquote>
                  {b.reference || b.translation ? (
                    <figcaption className="mt-4 text-[13pt] font-bold uppercase tracking-wider">{[b.reference, b.translation].filter(Boolean).join(" · ")}</figcaption>
                  ) : null}
                  {b.notice ? <p className="mt-2 text-[10pt]">{b.notice}</p> : null}
                </figure>
              ) : b.kind === "reference" ? (
                <div className="text-center">
                  <p className="text-[12pt] font-bold uppercase tracking-widest">Scripture</p>
                  <h1 className="mt-3 font-serif text-[40pt] font-semibold">{b.reference}</h1>
                  {b.translation ? <p className="mt-2 text-[16pt]">{b.translation}</p> : null}
                  <p className="mt-4 text-[16pt]">Open your Bible and read this passage together.</p>
                </div>
              ) : (
                <div className={`grid gap-8 ${b.emphasis ? "text-center font-serif font-semibold" : ""}`}>
                  {b.parts.map((part, j) => (
                    <section key={part.section}>
                      <h2 className="mb-4 text-[12pt] font-bold uppercase tracking-widest">{part.heading}{j === 0 && slide.pageCount > 1 ? ` · ${slide.page + 1} of ${slide.pageCount}` : ""}</h2>
                      <RichTextView doc={part.doc} />
                    </section>
                  ))}
                </div>
              )}
            </div>
            <p className="flex justify-between border-t border-black pt-2 text-[10pt]">
              <span>{title}</span>
              <span>{i + 1} / {slides.length}</span>
            </p>
          </section>
        );
      })}
    </div>
  );
}
