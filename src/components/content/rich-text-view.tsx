import type { ReactNode } from "react";
import type { Block, Inline, ListItem, RichDoc } from "@/lib/content/richtext";

function inline(nodes: Inline[] | undefined): ReactNode {
  return (nodes ?? []).map((node, index) => {
    if (node.type === "hardBreak") return <br key={index} />;
    let out: ReactNode = node.text;
    if (node.marks?.some((m) => m.type === "italic")) out = <em>{out}</em>;
    if (node.marks?.some((m) => m.type === "bold")) out = <strong>{out}</strong>;
    return <span key={index}>{out}</span>;
  });
}

function blocks(list: Array<Block | ListItem["content"][number]>): ReactNode {
  return list.map((block, index) => {
    switch (block.type) {
      case "paragraph":
        return block.content?.length ? <p key={index}>{inline(block.content)}</p> : null;
      case "heading":
        return block.attrs.level === 3 ? (
          <h3 key={index}>{inline(block.content)}</h3>
        ) : (
          <h4 key={index}>{inline(block.content)}</h4>
        );
      case "bulletList":
        return (
          <ul key={index}>
            {block.content.map((item, i) => (
              <li key={i}>{blocks(item.content)}</li>
            ))}
          </ul>
        );
      case "orderedList":
        return (
          <ol key={index}>
            {block.content.map((item, i) => (
              <li key={i}>{blocks(item.content)}</li>
            ))}
          </ol>
        );
      case "blockquote":
        return <blockquote key={index}>{blocks(block.content)}</blockquote>;
    }
  });
}

/** Renders a stored rich-text document as React elements. No HTML strings are ever injected. */
export function RichTextView({ doc, className }: { doc: RichDoc; className?: string }) {
  return <div className={`rich-text ${className ?? ""}`}>{blocks(doc.content)}</div>;
}
