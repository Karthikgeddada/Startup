import type { Metadata } from "next";

import { LearnView } from "@/features/learn/learn-view";

export const metadata: Metadata = { title: "Learn" };

export default function LearnPage() {
  return <LearnView />;
}
