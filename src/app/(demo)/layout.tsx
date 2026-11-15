import type { ReactNode } from "react";

/** Public demo pages with no site chrome, so full-screen experiences can be tried and tested as they really look. */
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
