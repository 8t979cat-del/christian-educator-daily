/**
 * An author's small round photo beside their name. Deliberately not enlargeable: no link, no
 * zoom, no drag, and the name beside it carries the meaning (so the image itself is decorative).
 */
export function AuthorPhoto({ src, size = 32 }: { src: string | null | undefined; size?: number }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a tiny inline data URL; next/image adds nothing here.
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="pointer-events-none inline-block shrink-0 select-none rounded-full object-cover align-middle ring-1 ring-line [-webkit-touch-callout:none]"
      style={{ width: size, height: size }}
    />
  );
}
