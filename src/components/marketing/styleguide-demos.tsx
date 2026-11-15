"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** Interactive demos for the style guide: these use the real Modal and toast components. */
export function StyleguideDemos() {
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { notify } = useToast();

  function simulateLoading() {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 1500);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setModalOpen(true)}>
        Open modal
      </Button>
      <Button variant="secondary" onClick={() => notify({ title: "Saved", description: "Example success message.", tone: "success" })}>
        Success toast
      </Button>
      <Button variant="secondary" onClick={() => notify({ title: "Could not save", description: "Example error message.", tone: "error" })}>
        Error toast
      </Button>
      <Button variant="secondary" loading={loading} onClick={simulateLoading}>
        Loading button
      </Button>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Example dialog"
        description="Press Escape, use the close button, or click outside to dismiss."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModalOpen(false)}>Confirm</Button>
          </>
        }
      >
        <p>Focus stays inside this dialog until it closes.</p>
      </Modal>
    </div>
  );
}
