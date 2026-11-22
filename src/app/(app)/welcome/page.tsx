import { redirect } from "next/navigation";

/** The first-login tour has been retired; old links go to today's devotional. */
export default function WelcomePage(): never {
  redirect("/today");
}
