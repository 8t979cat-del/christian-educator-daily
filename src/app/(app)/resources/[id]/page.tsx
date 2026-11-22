import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichTextView } from "@/components/content/rich-text-view";
import { Badge } from "@/components/ui/feedback";
import { uuidSchema } from "@/lib/auth/schemas";
import { requireAccess } from "@/lib/auth/session";
import { kindLabel } from "@/lib/billing/resource-text";
import { parseRichDoc } from "@/lib/content/richtext";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resource" };
export const dynamic = "force-dynamic";

export default async function ResourcePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("resources").select("id, kind, title, summary, body, status").eq("id", id).maybeSingle();
  // A resource the plan does not include is simply not returned; the list page offers the teaser.
  if (!data || data.status !== "published") notFound();
  const body = parseRichDoc(data.body);
  return (
    <article className="mx-auto max-w-3xl">
      <Badge>{kindLabel(data.kind)}</Badge>
      <h1 className="mt-3 font-serif text-3xl font-semibold md:text-4xl">{data.title}</h1>
      {data.summary ? <p className="mt-2 text-lg text-muted">{data.summary}</p> : null}
      <div className="mt-6">{body ? <RichTextView doc={body} /> : null}</div>
      <p className="mt-10 text-sm print:hidden"><Link href="/resources" className="text-brand underline">All resources</Link></p>
    </article>
  );
}
