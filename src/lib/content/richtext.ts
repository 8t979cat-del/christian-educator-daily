/**
 * Rich text is stored as a restricted ProseMirror document (JSON), never as HTML.
 * Everything the browser sends is rebuilt from an allow-list here, so unknown
 * nodes, marks, attributes and links cannot be stored, and rendering needs no
 * HTML injection.
 */

export type Mark = { type: "bold" | "italic" };
export type TextNode = { type: "text"; text: string; marks?: Mark[] };
export type HardBreak = { type: "hardBreak" };
export type Inline = TextNode | HardBreak;
export type Paragraph = { type: "paragraph"; content?: Inline[] };
export type Heading = { type: "heading"; attrs: { level: 3 | 4 }; content?: Inline[] };
export type ListItem = { type: "listItem"; content: Array<Paragraph | BulletList | OrderedList> };
export type BulletList = { type: "bulletList"; content: ListItem[] };
export type OrderedList = { type: "orderedList"; content: ListItem[] };
export type Blockquote = { type: "blockquote"; content: Array<Paragraph | BulletList | OrderedList> };
export type Block = Paragraph | Heading | BulletList | OrderedList | Blockquote;
export type RichDoc = { type: "doc"; content: Block[] };

export const EMPTY_DOC: RichDoc = { type: "doc", content: [] };

export const LIMITS = { nodes: 1500, depth: 6, characters: 12000 } as const;

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);

class Invalid extends Error {}

type Budget = { nodes: number; characters: number };

function inlineNodes(raw: unknown, budget: Budget): Inline[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Invalid("content must be a list");
  const out: Inline[] = [];
  for (const node of raw) {
    if (!isObject(node)) throw new Invalid("bad inline node");
    if (++budget.nodes > LIMITS.nodes) throw new Invalid("too many nodes");
    if (node.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (node.type === "text") {
      if (typeof node.text !== "string") throw new Invalid("text must be a string");
      if (node.text === "") continue;
      budget.characters += node.text.length;
      if (budget.characters > LIMITS.characters) throw new Invalid("too long");
      const marks: Mark[] = [];
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) throw new Invalid("bad marks");
        for (const mark of node.marks) {
          if (!isObject(mark) || (mark.type !== "bold" && mark.type !== "italic")) throw new Invalid("mark not allowed");
          if (!marks.some((m) => m.type === mark.type)) marks.push({ type: mark.type });
        }
      }
      out.push(marks.length ? { type: "text", text: node.text, marks } : { type: "text", text: node.text });
    } else {
      throw new Invalid(`node not allowed here: ${String(node.type)}`);
    }
  }
  return out;
}

function blockNodes(raw: unknown, budget: Budget, depth: number, allowed: ReadonlySet<string>): Block[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Invalid("content must be a list");
  if (depth > LIMITS.depth) throw new Invalid("nested too deeply");
  const out: Block[] = [];
  for (const node of raw) {
    if (!isObject(node) || typeof node.type !== "string" || !allowed.has(node.type)) {
      throw new Invalid(`node not allowed here: ${isObject(node) ? String(node.type) : typeof node}`);
    }
    if (++budget.nodes > LIMITS.nodes) throw new Invalid("too many nodes");
    switch (node.type) {
      case "paragraph": {
        const content = inlineNodes(node.content, budget);
        out.push(content.length ? { type: "paragraph", content } : { type: "paragraph" });
        break;
      }
      case "heading": {
        const level = isObject(node.attrs) ? node.attrs.level : undefined;
        if (level !== 3 && level !== 4) throw new Invalid("heading level not allowed");
        const content = inlineNodes(node.content, budget);
        out.push(content.length ? { type: "heading", attrs: { level }, content } : { type: "heading", attrs: { level } });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = listItems(node.content, budget, depth + 1);
        if (items.length === 0) throw new Invalid("empty list");
        out.push({ type: node.type, content: items } as BulletList | OrderedList);
        break;
      }
      case "blockquote": {
        const content = blockNodes(node.content, budget, depth + 1, INNER) as Blockquote["content"];
        out.push({ type: "blockquote", content });
        break;
      }
    }
  }
  return out;
}

const TOP = new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote"]);
const INNER = new Set(["paragraph", "bulletList", "orderedList"]);

function listItems(raw: unknown, budget: Budget, depth: number): ListItem[] {
  if (!Array.isArray(raw)) throw new Invalid("list content must be a list");
  const items: ListItem[] = [];
  for (const node of raw) {
    if (!isObject(node) || node.type !== "listItem") throw new Invalid("lists may contain only list items");
    if (++budget.nodes > LIMITS.nodes) throw new Invalid("too many nodes");
    const content = blockNodes(node.content, budget, depth, INNER) as ListItem["content"];
    items.push({ type: "listItem", content });
  }
  return items;
}

/** Returns a clean copy of the document, or null if it contains anything not on the allow-list. */
export function sanitizeRichDoc(raw: unknown): RichDoc | null {
  if (!isObject(raw) || raw.type !== "doc") return null;
  try {
    const budget: Budget = { nodes: 0, characters: 0 };
    return { type: "doc", content: blockNodes(raw.content, budget, 0, TOP) };
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

/** Parses the JSON string a form field carries. An empty string is an empty document. */
export function parseRichDoc(value: unknown): RichDoc | null {
  if (typeof value !== "string" || value.trim() === "") return { type: "doc", content: [] };
  if (value.length > 200_000) return null;
  try {
    return sanitizeRichDoc(JSON.parse(value));
  } catch {
    return null;
  }
}

function inlineText(nodes: Inline[] | undefined): string {
  return (nodes ?? []).map((n) => (n.type === "text" ? n.text : " ")).join("");
}

function blockText(block: Block | ListItem["content"][number]): string {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return inlineText(block.content);
    case "bulletList":
    case "orderedList":
      return block.content.map((item) => item.content.map(blockText).join(" ")).join(" ");
    case "blockquote":
      return block.content.map(blockText).join(" ");
  }
}

/** Plain text of a document, for previews, word counts and "is this empty?" checks. */
export function richTextToPlain(doc: RichDoc): string {
  return doc.content.map(blockText).join(" ").replace(/\s+/g, " ").trim();
}

export const isRichDocEmpty = (doc: RichDoc): boolean => richTextToPlain(doc) === "";
export const wordCount = (doc: RichDoc): number => {
  const text = richTextToPlain(doc);
  return text === "" ? 0 : text.split(" ").length;
};
