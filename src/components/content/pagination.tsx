import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { toQueryString } from "@/lib/content/params";

export function Pagination({
  basePath, params, page, pageSize, total,
}: {
  basePath: string;
  params: Record<string, string | number | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => `${basePath}${toQueryString({ ...params, page: p })}`;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={href(page - 1)} className={buttonStyles({ variant: "secondary" })}>
          Previous
        </Link>
      ) : <span />}
      <p className="text-sm text-muted">
        Page {page} of {pages}
      </p>
      {page < pages ? (
        <Link href={href(page + 1)} className={buttonStyles({ variant: "secondary" })}>
          Next
        </Link>
      ) : <span />}
    </nav>
  );
}
