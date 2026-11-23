"use client";

import { useRef, useState } from "react";
import { AuthorPhoto } from "@/components/content/author-photo";

/** Largest side of the saved photo, in pixels: shown at 32px, so 96 is sharp on any screen. */
const SIZE = 96;

/**
 * Picks a photo and shrinks it in the browser to a 96x96 centre-cropped JPEG before it is sent,
 * so a phone photo of several megabytes becomes a few kilobytes. The result goes in a hidden
 * field: "" keeps the current photo, "remove" deletes it, a data URL replaces it.
 */
export function PhotoPicker({ current }: { current?: string | null }) {
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<string | null>(current ?? null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const choose = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Choose a picture (JPEG, PNG, HEIC or WebP)."); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const side = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      const url = canvas.toDataURL("image/jpeg", 0.85);
      setValue(url);
      setPreview(url);
    } catch {
      setError("That picture could not be read. Try a JPEG or PNG.");
    }
  };

  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold">Photo <span className="font-normal text-muted">(optional, shown small beside the name)</span></span>
      <div className="flex flex-wrap items-center gap-3">
        {preview ? <AuthorPhoto src={preview} size={48} /> : <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-parchment text-xs text-muted">None</span>}
        <button type="button" onClick={() => input.current?.click()} className="min-h-11 rounded-control border border-[#b8c6ea] px-4 font-semibold text-brand hover:bg-brand-soft">
          {preview ? "Change photo" : "Choose photo"}
        </button>
        {preview ? (
          <button type="button" onClick={() => { setValue("remove"); setPreview(null); }} className="min-h-11 px-2 text-sm font-semibold text-muted underline hover:text-ink">Remove</button>
        ) : null}
        <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Photo file" onChange={(e) => void choose(e.target.files?.[0])} />
      </div>
      <input type="hidden" name="photo" value={value} />
      {value && value !== "remove" ? <span className="text-sm text-muted">New photo ready. Click Save to keep it.</span> : null}
      {error ? <span role="alert" className="text-sm text-danger">{error}</span> : null}
    </div>
  );
}
