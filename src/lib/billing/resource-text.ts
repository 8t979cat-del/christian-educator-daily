import { sanitizeRichDoc, type RichDoc } from "@/lib/content/richtext";

/** Plain text from the resource editor into the same safe rich-text document devotionals use. Blank lines separate paragraphs. */
export function textToDoc(text: string): RichDoc | null {
  const paragraphs = text.replace(/\r\n?/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const doc = {
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  };
  return sanitizeRichDoc(doc);
}

export const RESOURCE_KINDS = [
  { value: "educator_resource", label: "Educator resource", feature: "premium_resources" },
  { value: "faculty_devotional", label: "Weekly faculty devotional", feature: "faculty_devotionals" },
  { value: "staff_meeting", label: "Staff meeting resource", feature: "staff_meeting_resources" },
  { value: "presentation_material", label: "Presentation material", feature: "presentation_materials" },
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number]["value"];
export const kindLabel = (kind: string) => RESOURCE_KINDS.find((k) => k.value === kind)?.label ?? kind;
