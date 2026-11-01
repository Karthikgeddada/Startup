"use client";

import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Bot, Clock, FileCode2, GitBranch, Layers, Play, ScrollText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, SkeletonCard } from "@/components/ui/feedback";
import { Tabs } from "@/components/ui/tabs";
import { ProjectCard } from "@/components/shared/project-card";
import { useActivity, useProjects, useRepoFiles } from "@/hooks/use-services";
import { formatRelativeTime } from "@/lib/format";
import { useUIStore } from "@/stores/ui-store";
import { useAgentStore } from "@/stores/agent-store";

const TABS = ["overview", "files", "changes", "tests", "logs", "settings"] as const;
// Sections without live data render explicit empty states — never fabricated rows.
type WorkspaceTab = (typeof TABS)[number];

/**
 * Workspace — the project-centric view. No project selected: the project
 * grid. Selected: the project's working surface with honest tabs — sections
 * without real data yet show explicit empty states, never fabricated rows.
 */
export function WorkspaceView() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const projectId = searchParams.get("project");
  const projectsQuery = useProjects();
  const project = projectsQuery.data?.find((entry) => entry.id === projectId) ?? null;

  const openNewProject = useUIStore((state) => state.openNewProject);

  // Project selector view.
  if (!project) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 pb-24 pt-10 md:px-8">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">Workspace</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
          Pick a project to work on — or create a new one.
        </p>
        {projectsQuery.isLoading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : !projectsQuery.data || projectsQuery.data.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<Layers className="h-5 w-5" aria-hidden />}
              title="No projects yet"
              description="Create your first project from a prompt, a template, a GitHub repository, or blank."
              action={<Button size="sm" onClick={() => openNewProject("blank")}>New project</Button>}
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {projectsQuery.data.map((entry) => (
              <ProjectCard key={entry.id} project={entry} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ProjectWorkspace
      key={project.id}
      project={project}
      tab={(searchParams.get("tab") as WorkspaceTab | null) ?? "overview"}
      onTabChange={(tab) =>
        router.replace(`/workspace?project=${project.id}&tab=${tab}`, { scroll: false })
      }
    />
  );
}

function ProjectWorkspace({
  project,
  tab,
  onTabChange,
}: {
  project: NonNullable<ReturnType<typeof useProjects>["data"]>[number];
  tab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}) {
  const setAgentPanelOpen = useUIStore((state) => state.setAgentPanelOpen);
  const setContextProject = useAgentStore((state) => state.setContextProject);
  const activityQuery = useActivity(8);
  const filesQuery = useRepoFiles(project.repository ? project.id : null);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 md:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-[26px] font-semibold tracking-[-0.02em] text-foreground">
              {project.name}
            </h1>
            {project.status === "active" ? (
              <Badge variant="success" dot>Active</Badge>
            ) : project.status === "draft" ? (
              <Badge variant="neutral" dot>Draft</Badge>
            ) : (
              <Badge variant="neutral">Archived</Badge>
            )}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            {project.repository ? (
              <span className="flex items-center gap-1 font-mono">
                <GitBranch className="h-3.5 w-3.5" aria-hidden />
                {project.repository.owner}/{project.repository.name} · {project.repository.defaultBranch}
              </span>
            ) : (
              <span className="font-mono">no repository connected</span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatRelativeTime(project.updatedAt)}
            </span>
          </p>
          {project.currentTask ? (
            <p className="mt-2 text-[13px] text-muted-foreground">
              Agent is on: <span className="font-medium text-foreground">{project.currentTask}</span>
            </p>
          ) : null}
        </div>

        <Button
          icon={<Bot className="h-4 w-4" aria-hidden />}
          onClick={() => {
            setContextProject(project.id);
            setAgentPanelOpen(true);
          }}
        >
          Work with the agent
        </Button>
      </div>

      {/* Tabs */}
      <div className="mt-8">
        <Tabs
          items={TABS.map((entry) => ({ id: entry, label: capitalize(entry) }))}
          activeId={tab}
          onChange={(entry) => onTabChange(entry as WorkspaceTab)}
        />

        <div className="mt-6">
          {tab === "overview" ? (
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">About</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {project.description ?? "No description yet — add one when the project takes shape."}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {project.techStack.length > 0 ? (
                    project.techStack.map((technology) => (
                      <Badge key={technology} variant="outline">{technology}</Badge>
                    ))
                  ) : (
                    <p className="text-[12px] text-subtle-foreground">No stack declared yet.</p>
                  )}
                </div>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">Activity</h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {(activityQuery.data ?? [])
                    .filter((entry) => entry.projectId === project.id)
                    .map((entry) => (
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
                  {(activityQuery.data ?? []).filter((entry) => entry.projectId === project.id).length === 0 ? (
                    <li className="text-[12px] text-subtle-foreground">No activity recorded yet.</li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}

          {tab === "files" ? (
            !project.repository ? (
              <EmptyState
                icon={<FileCode2 className="h-5 w-5" aria-hidden />}
                title="No repository connected"
                description="Import a GitHub repository to browse its files here."
              />
            ) : filesQuery.isLoading ? (
              <div className="grid gap-2">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : !filesQuery.data || filesQuery.data.length === 0 ? (
              <EmptyState
                icon={<FileCode2 className="h-5 w-5" aria-hidden />}
                title="No files visible"
                description="The repository appears empty, or the listing has not synced yet."
              />
            ) : (
              <ul className="overflow-hidden rounded-card border border-border" aria-label="Repository files">
                {filesQuery.data.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 last:border-b-0"
                  >
                    <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">
                      {file.path}
                    </span>
                    <Badge variant="outline">{file.type}</Badge>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {tab === "changes" ? (
            <EmptyState
              icon={<GitBranch className="h-5 w-5" aria-hidden />}
              title="No proposed changes right now"
              description="When the agent proposes a diff, it appears here for review — approvals happen in the conversation."
            />
          ) : null}

          {tab === "tests" ? (
            <EmptyState
              icon={<Play className="h-5 w-5" aria-hidden />}
              title="No test runs yet"
              description="Test runs appear here after an approved change is applied to the project."
            />
          ) : null}

          {tab === "logs" ? (
            <EmptyState
              icon={<ScrollText className="h-5 w-5" aria-hidden />}
              title="No execution logs yet"
              description="Tool runs from agent conversations will be aggregated here. For now, open the log on any tool block in the conversation."
            />
          ) : null}

          {tab === "settings" ? (
            <Card>
              <CardBody className="flex flex-col gap-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-foreground">Project details</h2>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    Editing project settings arrives with the backend service. Creation date, repository, and stack are shown live from the service layer.
                  </p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Created" value={formatRelativeTime(project.createdAt)} />
                  <Detail
                    label="Repository"
                    value={project.repository ? `${project.repository.owner}/${project.repository.name}` : "None connected"}
                  />
                  <Detail label="Status" value={capitalize(project.status)} />
                  <Detail label="Stack" value={project.techStack.length > 0 ? project.techStack.join(", ") : "Not declared"} />
                </dl>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px] text-foreground">{value}</dd>
    </div>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
