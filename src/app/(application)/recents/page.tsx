import type { Metadata } from "next";

import { RecentsView } from "@/features/recents/recents-view";

export const metadata: Metadata = { title: "Recents" };

export default function RecentsPage() {
  return <RecentsView />;
}
