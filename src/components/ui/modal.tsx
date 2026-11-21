"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { Icon } from "./icon";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

/**
 * Accessible modal built on the native <dialog> element, which provides focus
 * trapping, Escape-to-close and inert background without extra code.
 */
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onClick={(event) => {
        // Clicks on the backdrop target the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-ink/70 bg-surface p-0 text-ink outline outline-1 outline-offset-4 outline-line backdrop:bg-brand/60"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-2xl font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-m-2 grid size-11 place-items-center rounded-control text-muted hover:bg-brand-soft"
          >
            <Icon name="x" />
          </button>
        </div>
        {description ? (
          <p id={descriptionId} className="mt-2 text-muted">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}
