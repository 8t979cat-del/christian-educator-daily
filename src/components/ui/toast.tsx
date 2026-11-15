"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

type ToastTone = "info" | "success" | "error";
type ToastInput = { title: string; description?: string; tone?: ToastTone };
type ToastItem = ToastInput & { id: number; tone: ToastTone };

const ToastContext = createContext<{ notify: (toast: ToastInput) => void } | null>(null);

const DISMISS_AFTER_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...input, id, tone: input.tone ?? "info" }]);
      window.setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Live region: announced politely by screen readers. Sits above the mobile tab bar. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-3 md:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-control border bg-surface p-4 shadow-lg",
              toast.tone === "error" ? "border-danger/50" : "border-line",
            )}
          >
            <Icon
              name={toast.tone === "error" ? "alert" : toast.tone === "success" ? "check" : "info"}
              className={cn("mt-0.5 shrink-0", toast.tone === "error" ? "text-danger" : "text-brand")}
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{toast.title}</p>
              {toast.description ? <p className="mt-0.5 text-muted">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-m-2 grid size-11 shrink-0 place-items-center rounded-control text-muted hover:bg-brand-soft"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}
