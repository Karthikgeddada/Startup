import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkspaceView } from "@/features/workspace/workspace-view";

export const metadata: Metadata = { title: "Workspace" };

// WorkspaceView reads ?project=… / ?tab=… via useSearchParams — Next.js requires
// a Suspense boundary above it for static prerendering.
export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceView />
    </Suspense>
  );
}
