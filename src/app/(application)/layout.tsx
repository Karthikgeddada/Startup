import { AppShell } from "@/components/layout/app-shell";

/** The three-part application shell: sidebar · workspace · agent panel. */
export default function ApplicationLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
