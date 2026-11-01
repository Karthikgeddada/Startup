import type { Metadata } from "next";
import { Suspense } from "react";

import { HomeView } from "@/features/home/home-view";

export const metadata: Metadata = { title: "Home" };

// HomeView reads ?new=… / ?template=… via useSearchParams — Next.js requires
// a Suspense boundary above it for static prerendering.
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeView />
    </Suspense>
  );
}
