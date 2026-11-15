"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { isRichDocEmpty, sanitizeRichDoc, wordCount, type RichDoc } from "@/lib/content/richtext";

/** Only what the server's allow-list accepts. Anything else is switched off. */
const extensions = [
  StarterKit.configure({
    heading: { levels: [3, 4] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    link: false,
    underline: false,
    trailingNode: false,
  }),
];

type Props = {
  /** Form field name. The document travels as JSON in a hidden input. */
  name: string;
  label: string;
  hint?: string;
  error?: string;
  initial?: RichDoc;
  required?: boolean;
  /** Minimum editing height in rem. */
  minHeight?: number;
  /** Called with each new document; used by demos that have no form. */
  onChange?: (doc: RichDoc) => void;
};

export function RichTextEditor({ name, label, hint, error, initial, required, minHeight = 10, onChange }: Props) {
  const id = useId();
  const [doc, setDoc] = useState<RichDoc>(initial ?? { type: "doc", content: [] });

  const editor = useEditor({
    extensions,
    content: initial && initial.content.length > 0 ? initial : undefined,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: `${id}-editor`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-labelledby": `${id}-label`,
        ...(hint ? { "aria-describedby": `${id}-hint` } : {}),
        class: "rich-text outline-none px-4 py-3",
        style: `min-height:${minHeight}rem`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const clean = sanitizeRichDoc(e.getJSON());
      if (clean) {
        setDoc(clean);
        onChange?.(clean);
      }
    },
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  const words = wordCount(doc);

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-semibold">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}

      <div
        className={cn(
          "rounded-control border bg-surface focus-within:outline focus-within:outline-3 focus-within:outline-brand",
          error ? "border-danger" : "border-line-strong/60",
        )}
      >
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-1 border-b border-line p-1.5">
          <ToolButton label="Bold" pressed={active?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <strong>B</strong>
          </ToolButton>
          <ToolButton label="Italic" pressed={active?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <em>I</em>
          </ToolButton>
          <ToolButton label="Heading" pressed={active?.h3} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
            H
          </ToolButton>
          <ToolButton label="Bulleted list" pressed={active?.bullet} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            • List
          </ToolButton>
          <ToolButton label="Numbered list" pressed={active?.ordered} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            1. List
          </ToolButton>
          <ToolButton label="Quote" pressed={active?.quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            Quote
          </ToolButton>
          <span className="mx-1 w-px bg-line" aria-hidden="true" />
          <ToolButton label="Undo" disabled={!active?.canUndo} onClick={() => editor?.chain().focus().undo().run()}>
            Undo
          </ToolButton>
          <ToolButton label="Redo" disabled={!active?.canRedo} onClick={() => editor?.chain().focus().redo().run()}>
            Redo
          </ToolButton>
        </div>
        <EditorContent editor={editor} />
      </div>

      <div className="flex justify-between gap-4 text-sm">
        {error ? <p className="font-medium text-danger">{error}</p> : <span />}
        <span className="text-muted" aria-live="polite">
          {words} {words === 1 ? "word" : "words"}
          {required && isRichDocEmpty(doc) ? " (required)" : ""}
        </span>
      </div>

      <input type="hidden" name={name} value={JSON.stringify(doc)} />
    </div>
  );
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()} // keep the editor's selection
      onClick={onClick}
      className={cn(
        "min-h-9 min-w-9 rounded-control px-2.5 text-sm font-medium hover:bg-brand-soft disabled:opacity-40 disabled:hover:bg-transparent",
        pressed ? "bg-brand-soft text-brand" : "text-ink",
      )}
    >
      {children}
    </button>
  );
}
