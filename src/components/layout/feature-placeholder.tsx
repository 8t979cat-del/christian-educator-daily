import type { ReactNode } from "react";
import { Badge, EmptyState } from "@/components/ui/feedback";
import type { IconName } from "@/components/ui/icon";
import { PageHeader } from "./container";

/**
 * Honest placeholder for a section that exists in the navigation but has not
 * been built yet. It says so plainly and names the planned release.
 */
export function FeaturePlaceholder({
  title,
  intro,
  icon,
  release,
  emptyTitle,
  emptyBody,
  action,
}: {
  title: string;
  intro: string;
  icon: IconName;
  release: string;
  emptyTitle: string;
  emptyBody: ReactNode;
  action?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} description={intro} actions={<Badge>Planned: {release}</Badge>} />
      <EmptyState icon={icon} title={emptyTitle} description={emptyBody} action={action} />
    </>
  );
}
