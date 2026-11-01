"use client";

import Link from "next/link";
import { Clock, GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import type { Project } from "@/types/domain";

/** A project entry everywhere in CURVIN: Home grid, Recents, Workspace. */
export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/workspace?project=${project.id}`}
      className="group block rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`Open project ${project.name}`}
    >
      <Card className="h-full transition-all duration-200 ease-swift group-hover:border-border-strong group-hover:shadow-card">
        <CardBody className="flex h-full flex-col gap-2.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="truncate text-[14px] font-semibold text-foreground">
              {project.name}
            </h3>
            <ProjectStatusBadge status={project.status} />
          </div>

          {project.description ? (
            <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {project.description}
            </p>
          ) : (
            <p className="line-clamp-2 text-[12.5px] italic text-subtle-foreground">No description</p>
          )}

          <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-muted-foreground">
            {project.repository ? (
              <span className="flex items-center gap-1 truncate font-mono">
                <GitBranch className="h-3 w-3 shrink-0" aria-hidden />
                {project.repository.owner}/{project.repository.name}
              </span>
            ) : (
              <span className="font-mono">no repository yet</span>
            )}
            <span className="flex-1" />
            <span className="flex shrink-0 items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {formatRelativeTime(project.updatedAt)}
            </span>
          </div>
        </CardBody>
      </Card>
    </Link>
  );
}

function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  switch (status) {
    case "active":
      return <Badge variant="success" dot>Active</Badge>;
    case "draft":
      return <Badge variant="neutral" dot>Draft</Badge>;
    case "importing":
      return <Badge variant="warning" dot>Importing</Badge>;
    case "error":
      return <Badge variant="danger" dot>Error</Badge>;
    case "archived":
      return <Badge variant="neutral">Archived</Badge>;
  }
}
