import type { Metadata } from "next";

import { DiscoverView } from "@/features/discover/discover-view";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return <DiscoverView />;
}
