import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Compass className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Page not found</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          That route does not exist in CURVIN.
        </p>
      </div>
      <Link href="/home">
        <Button>Go to Home</Button>
      </Link>
    </div>
  );
}
