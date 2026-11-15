import { redirect } from "next/navigation";

/** Old address kept so saved links keep working. */
export default async function ArchivedDevotionalRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/devotional/${encodeURIComponent(id)}`);
}
