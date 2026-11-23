"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { AuthorPhoto } from "@/components/content/author-photo";

export type ContributorProfile = { name: string; bio: string | null; photo: string | null };

/**
 * A contributor's photo and credit line ("Written by …") as one button. Clicking it opens a small
 * window over the page with their name and bio. The photo stays small in both places.
 */
export function ContributorCard({ profile, children }: { profile: ContributorProfile; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-control text-left font-semibold text-ink underline decoration-line-strong/60 decoration-1 underline-offset-4 hover:text-brand hover:decoration-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <AuthorPhoto src={profile.photo} />
        <span>{children}</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={profile.name}>
        <div className="flex items-start gap-4">
          <AuthorPhoto src={profile.photo} size={48} />
          <p className="whitespace-pre-line leading-relaxed text-ink">{profile.bio?.trim() || "No bio has been added yet."}</p>
        </div>
      </Modal>
    </>
  );
}
