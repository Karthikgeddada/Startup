import { redirect } from "next/navigation";

/** CURVIN opens on Home — the product's starting point. */
export default function RootPage() {
  redirect("/home");
}
