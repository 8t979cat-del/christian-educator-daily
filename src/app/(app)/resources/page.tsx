import { redirect } from "next/navigation";

/** Resources were retired: faculty devotionals are in the Archive, marked "For faculty". Old links land there. */
export default function ResourcesPage() {
  redirect("/archive");
}
