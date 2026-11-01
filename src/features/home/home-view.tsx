"use client";

import { useSearchParams } from "next/navigation";
import { Clock, GitBranch, MessageSquare, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import { PromptComposer } from "@/components/agent/prompt-composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, SkeletonCard } from "@/components/ui/feedback";
import { ProjectCard } from "@/components/shared/project-card";
import {
  useActivity,
  useConversations,
  useCurrentUser,
  useProjects,
  useTemplates,
} from "@/hooks/use-services";
import { formatRelativeTime } from "@/lib/format";
import { useAgentStore } from "@/stores/agent-store";
import { useUIStore, type NewProjectMode } from "@/stores/ui-store";

/**
 * CURVIN Home — the zero-friction starting point. Prompt-first creation,
 * honest shortcuts to every creation mode, and the freshest work one click
 * away. Everything renders through the shared design system.
 * Deep links: ?new=blank|github|template|ai (&template=…).
 * All data flows through hooks/use-services; timestamps render via formatRelativeTime.
 */
export function HomeView() {
  const openNewProject = useUIStore((state) => state.openNewProject);
  const setAgentPanelOpen = useUIStore((state) => state.setAgentPanelOpen);
  const setActiveConversation = useAgentStore((state) => state.setActiveConversation);

  const searchParams = useSearchParams();
  const handled = useRef(false);

  // Deep links like ?new=github or ?new=template&template=tpl-web-openai
  // open the creation flow directly. Runs once per mount.
  useEffect(() => {
    if (handled.current) return;
    const mode = searchParams.get("new") as NewProjectMode | null;
    if (mode === "github" || mode === "template" || mode === "ai" || mode === "blank") {
      handled.current = true;
      openNewProject(mode, searchParams.get("template"));
    }
  }, [searchParams, openNewProject]);

  const { data: user } = useCurrentUser();
  const projectsQuery = useProjects();
  const conversationsQuery = useConversations();
  const activityQuery = useActivity(6);
  const templatesQuery = useTemplates();

  const projects = projectsQuery.data;
  const recentProjects = projects?.slice(0, 4);
  const recentConversations = conversationsQuery.data?.slice(0, 3);
  const templates = templatesQuery.data?.slice(0, 4);

  const greeting = user ? `${greetingByTime()}, ${user.name.split(" ")[0]}` : "Welcome to CURVIN";

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-24 pt-14 md:px-8 md:pt-20">
      {/* ——— Hero: prompt-first ——— */}
      <section aria-labelledby="home-hero-title">
        <p className="text-[13px] font-medium text-muted-foreground">{greeting}</p>
        <h1
          id="home-hero-title"
          className="mt-2 max-w-2xl text-balance text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[34px]"
        >
          Describe the software. CURVIN plans it, builds it, and shows its work.
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Start with a prompt — you will review every plan and approve every change
          before anything is applied.
        </p>

        <div className="mt-6 max-w-2xl">
          <PromptComposer
            autoFocus
            placeholder="Describe the application you want to build…"
            onSubmit={(text) => openNewProject("ai", null, text)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Sparkles className="h-3.5 w-3.5" aria-hidden />}
            onClick={() => openNewProject("ai")}
          >
            Create with a prompt
          </Button>
          <Button variant="secondary" size="sm" icon={<GitBranch className="h-3.5 w-3.5" aria-hidden />} onClick={() => openNewProject("github")}>
            Import from GitHub
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openNewProject("template")}>
            Start from a template
          </Button>
        </div>
      </section>

      {/* ——— Recent projects ——— */}
      <section className="mt-16" aria-labelledby="home-projects-title">
        <SectionHeader id="home-projects-title" title="Your projects" action="View workspace" actionHref="/workspace" />
        {projectsQuery.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : !recentProjects || recentProjects.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" aria-hidden />}
            title="No projects yet"
            description="Describe an application above, import a repository, or start from a template — your first project takes under a minute."
            action={<Button size="sm" onClick={() => openNewProject("blank")}>Create a project</Button>}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recentProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {/* ——— Recent conversations + activity ——— */}
      <section className="mt-16 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div aria-labelledby="home-conversations-title">
          <SectionHeader id="home-conversations-title" title="Recent conversations" />
          {conversationsQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : !recentConversations || recentConversations.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-5 w-5" aria-hidden />}
              title="No conversations yet"
              description="Ask the agent to plan a feature, explain a repository, or propose a change."
              action={<Button size="sm" onClick={() => setAgentPanelOpen(true)}>Open the agent</Button>}
            />
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Recent conversations">
              {recentConversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConversation(conversation.id);
                      setAgentPanelOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-card border border-border bg-card px-4 py-3 text-left transition-colors duration-150 ease-swift hover:border-border-strong"
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {conversation.title}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatRelativeTime(conversation.updatedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div aria-labelledby="home-activity-title">
          <SectionHeader id="home-activity-title" title="Latest activity" />
          {activityQuery.isLoading ? (
            <SkeletonCard />
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Latest activity">
              {(activityQuery.data ?? []).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5 text-[12.5px]">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-foreground">{entry.description}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ——— Templates ——— */}
      {templates && templates.length > 0 ? (
        <section className="mt-16" aria-labelledby="home-templates-title">
          <SectionHeader
            id="home-templates-title"
            title="Start from a template"
            action="Browse Learn"
            actionHref="/learn"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id} className="flex">
                <CardBody className="flex flex-1 flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[13.5px] font-semibold text-foreground">{template.name}</h3>
                    <Badge>{template.category}</Badge>
                  </div>
                  <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                    {template.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {template.stack.slice(0, 4).map((technology) => (
                      <Badge key={technology} variant="outline">{technology}</Badge>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2 self-start"
                    onClick={() => openNewProject("template", template.id)}
                  >
                    Use template
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-14 flex items-center gap-1.5 text-[11.5px] text-subtle-foreground">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Interface preferences and in-flight conversations are remembered across sessions.
      </p>
    </div>
  );
}

function SectionHeader({
  id,
  title,
  action,
  actionHref,
}: {
  id: string;
  title: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="mb-3.5 flex items-baseline gap-3">
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      {action && actionHref ? (
        <a href={actionHref} className="text-[12px] font-medium text-accent transition-colors hover:text-accent-hover">
          {action}
        </a>
      ) : null}
    </div>
  );
}

function greetingByTime(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
