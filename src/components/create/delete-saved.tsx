"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteSavedDevotionalAction } from "@/app/actions/submissions";
import { useToast } from "@/components/ui/toast";

/** "Delete" beside Edit and Present on one of the teacher's saved devotionals, after a confirmation. */
export function DeleteSavedButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  const remove = () => {
    if (!window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
    start(async () => {
      const result = await deleteSavedDevotionalAction(id);
      if (!result.ok) { notify({ title: "Could not delete", description: result.error, tone: "error" }); return; }
      notify({ title: "Deleted", description: `“${title}” was deleted.`, tone: "success" });
      router.refresh();
    });
  };
  return (
    <button type="button" onClick={remove} disabled={pending} className="font-semibold text-danger underline disabled:opacity-50">
      {pending ? "Deleting…" : "Delete"}<span className="sr-only"> {title}</span>
    </button>
  );
}
