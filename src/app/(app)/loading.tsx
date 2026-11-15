import { Skeleton, Spinner } from "@/components/ui/feedback";

/** Shown by Next.js while an application page is loading. */
export default function Loading() {
  return (
    <div aria-busy="true">
      <Spinner label="Loading page" className="mb-6 text-brand" />
      <Skeleton className="h-10 w-2/3 max-w-md" />
      <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      <Skeleton className="mt-8 h-64 w-full rounded-card" />
    </div>
  );
}
