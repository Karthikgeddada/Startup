import { Compass, FolderGit2, GraduationCap, History, House, type LucideIcon } from "lucide-react";

export type NavItemId = "home" | "learn" | "workspace" | "recents" | "discover";

export interface NavItem {
  id: NavItemId;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

/**
 * Exactly five primary navigation items. Product-level rule: do not add more.
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/home",
    icon: House,
    description: "Start here — create, continue, and jump back into work",
  },
  {
    id: "learn",
    label: "Learn",
    href: "/learn",
    icon: GraduationCap,
    description: "Engineering knowledge center",
  },
  {
    id: "workspace",
    label: "Workspace",
    href: "/workspace",
    icon: FolderGit2,
    description: "Develop, review, and manage projects",
  },
  {
    id: "recents",
    label: "Recents",
    href: "/recents",
    icon: History,
    description: "Everything you touched recently",
  },
  {
    id: "discover",
    label: "Discover",
    href: "/discover",
    icon: Compass,
    description: "Templates, integrations, and capabilities",
  },
] as const;

export const SITE = {
  name: "CURVIN",
  wordmark: "curvin",
  tagline: "Autonomous software engineering",
  description:
    "CURVIN is an AI-powered autonomous software engineering platform for creating, understanding, developing, testing, and deploying software.",
  agentName: "Curvin Agent",
} as const;

/** Documented keyboard shortcuts. None conflict with browser or OS defaults. */
export const APP_SHORTCUTS = [
  { keys: "⌘K / Ctrl K", label: "Open search & command menu", actionId: "open-command-menu" },
  { keys: "[", label: "Toggle sidebar", actionId: "toggle-sidebar" },
  { keys: "]", label: "Toggle Curvin agent panel", actionId: "toggle-agent-panel" },
  { keys: "Esc", label: "Close dialogs and menus", actionId: "close-overlay" },
] as const;
