"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { useEffect } from "react";

import { CurvinLogo, CurvinMark } from "@/components/brand/curvin-logo";
import { Button, IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { Tooltip } from "@/components/ui/tooltip";
import { PRIMARY_NAV_ITEMS } from "@/config/site";
import { useCurrentUser } from "@/hooks/use-services";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";

/**
 * Primary navigation. Exactly five items, expand/collapse with tooltips,
 * preference persisted across sessions. On <lg it becomes a drawer.
 */
export function Sidebar() {
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const mobileNavOpen = useUIStore((state) => state.mobileNavOpen);
  const setMobileNavOpen = useUIStore((state) => state.setMobileNavOpen);
  const openNewProject = useUIStore((state) => state.openNewProject);
  const pathname = usePathname();

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileNavOpen]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        aria-label="Primary navigation"
        className="hidden shrink-0 flex-col border-r border-border bg-background transition-[width] duration-200 ease-swift lg:flex"
        style={{ width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)" }}
      >
        <div className="flex h-[var(--header-height)] items-center gap-2 px-3.5">
          <Link
            href="/home"
            aria-label="CURVIN home"
            className="flex items-center rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted"
          >
            {collapsed ? <CurvinMark size={22} /> : <CurvinLogo size={22} />}
          </Link>
          <span className="flex-1" />
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <IconButton
              label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleSidebar}
              size="sm"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
            </IconButton>
          </Tooltip>
        </div>

        <div className="px-3 pb-2">
          {collapsed ? (
            <Tooltip label="New project">
              <IconButton label="New project" onClick={() => openNewProject()} className="mx-auto">
                <Plus className="h-4 w-4" aria-hidden />
              </IconButton>
            </Tooltip>
          ) : (
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} className="w-full" onClick={() => openNewProject()}>
              New project
            </Button>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1 py-3" aria-label="Main">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <SidebarLink key={item.id} item={item} collapsed={collapsed} pathname={pathname} />
          ))}
        </nav>

        <SidebarUser collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div
            aria-hidden
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/40 animate-fade-in"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-border bg-background shadow-overlay animate-fade-in"
          >
            <div className="flex h-[var(--header-height)] items-center justify-between px-3.5">
              <CurvinLogo size={22} />
              <IconButton label="Close navigation" onClick={() => setMobileNavOpen(false)}>
                <X className="h-4 w-4" aria-hidden />
              </IconButton>
            </div>
            <div className="px-3 pb-2">
              <Button icon={<Plus className="h-4 w-4" aria-hidden />} className="w-full" onClick={() => { setMobileNavOpen(false); openNewProject(); }}>
                New project
              </Button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 py-3" aria-label="Main mobile">
              {PRIMARY_NAV_ITEMS.map((item) => (
                <SidebarLink
                  key={item.id}
                  item={item}
                  collapsed={false}
                  pathname={pathname}
                  onNavigate={() => setMobileNavOpen(false)}
                />
              ))}
            </nav>
            <SidebarUser collapsed={false} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function SidebarLink({
  item,
  collapsed,
  pathname,
  onNavigate,
}: {
  item: (typeof PRIMARY_NAV_ITEMS)[number];
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ease-swift",
        "mx-2",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      {collapsed ? null : item.label}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip label={item.label}>
        <span className="w-full">{link}</span>
      </Tooltip>
    );
  }
  return link;
}

function SidebarUser({ collapsed }: { collapsed: boolean }) {
  const { data: user, isLoading } = useCurrentUser();

  return (
    <div className={cn("border-t border-border p-3", collapsed && "flex justify-center px-0")}>
      {isLoading ? (
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          {!collapsed ? <Skeleton className="h-4 w-28" /> : null}
        </div>
      ) : user ? (
        <div className="flex items-center gap-2.5 overflow-hidden" title={user.email}>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent"
          >
            {user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">{user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
