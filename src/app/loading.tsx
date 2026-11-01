import { Spinner } from "@/components/ui/feedback";

/** Route-level loading fallback — instant, quiet, centered. */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner size={22} />
    </div>
  );
}
