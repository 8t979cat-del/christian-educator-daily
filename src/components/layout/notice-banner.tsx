import { Alert } from "@/components/ui/feedback";
import { noticeFor } from "@/lib/notices";

/** Shows a fixed message for a `?notice=` code left by a redirect. */
export function NoticeBanner({ code }: { code: string | string[] | undefined }) {
  const notice = noticeFor(code);
  if (!notice) return null;
  return (
    <Alert tone={notice.tone} className="mb-6">
      {notice.text}
    </Alert>
  );
}
