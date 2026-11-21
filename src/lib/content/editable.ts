import type { Block, Inline, RichDoc } from "./richtext";

/**
 * Plain-text editing for presentation text: paragraphs separated by a blank line.
 * Formatting (bold, lists) is flattened to paragraphs when edited this way.
 */
const inlineText = (nodes: Inline[] | undefined) => (nodes ?? []).map((n) => (n.type === "text" ? n.text : "\n")).join("");

function blockText(block: Block): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return [inlineText(block.content)];
    case "bulletList":
    case "orderedList":
      return block.content.flatMap((item) => item.content.flatMap((b) => blockText(b as Block)));
    case "blockquote":
      return block.content.flatMap((b) => blockText(b));
  }
}

export function docToText(doc: RichDoc): string {
  return doc.content.flatMap(blockText).map((t) => t.trim()).filter(Boolean).join("\n\n");
}

export function textToDoc(text: string): RichDoc {
  return {
    type: "doc",
    content: text
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: p.slice(0, 4000) }] })),
  };
}
