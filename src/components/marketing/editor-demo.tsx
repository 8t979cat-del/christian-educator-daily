"use client";

import { useState } from "react";
import { RichTextEditor } from "@/components/content/rich-text-editor";
import { RichTextView } from "@/components/content/rich-text-view";
import { EMPTY_DOC, type RichDoc } from "@/lib/content/richtext";

/** The real editor with no form around it: type, format, and see exactly what would be stored and shown. */
export function EditorDemo() {
  const [doc, setDoc] = useState<RichDoc>(EMPTY_DOC);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="min-w-0">
        <RichTextEditor name="demo" label="Reflection" hint="Bold, italic, a heading, lists and quotes. Nothing else is accepted." initial={EMPTY_DOC} onChange={setDoc} minHeight={9} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">What readers see</p>
        <div className="mt-1.5 min-h-40 rounded-control border border-line bg-surface p-4" data-testid="demo-output">
          {doc.content.length ? <RichTextView doc={doc} /> : <p className="text-muted">Nothing yet.</p>}
        </div>
        <p className="mt-4 text-sm font-semibold">What is stored</p>
        <pre className="mt-1.5 max-h-40 overflow-auto rounded-control bg-ink p-3 text-xs text-white" data-testid="demo-json">{JSON.stringify(doc)}</pre>
      </div>
    </div>
  );
}
