"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, LayoutTemplate, FilePlus2, GitBranch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonCard } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/input";
import { useCreateProject, useGitHubRepositories, useTemplates } from "@/hooks/use-services";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import { useUIStore, type NewProjectMode } from "@/stores/ui-store";

const MODES: { id: NewProjectMode; label: string; icon: typeof FilePlus2; hint: string }[] = [
  { id: "blank", label: "Blank", icon: FilePlus2, hint: "Start from an empty project" },
  { id: "github", label: "GitHub", icon: GitBranch, hint: "Import an existing repository" },
  { id: "template", label: "Template", icon: LayoutTemplate, hint: "Start from a vetted template" },
  { id: "ai", label: "Prompt", icon: Sparkles, hint: "Describe it — CURVIN drafts it" },
];

const formSchema = z
  .object({
    name: z.string().trim().min(3, "Name needs at least 3 characters").max(60, "Keep the name under 60 characters"),
    description: z.string().trim().max(280, "Keep the description under 280 characters").optional().or(z.literal("")),
    mode: z.enum(["blank", "github", "template", "ai"]),
    githubRepoId: z.string().optional().or(z.literal("")),
    templateId: z.string().optional().or(z.literal("")),
    prompt: z.string().optional().or(z.literal("")),
  })
  .superRefine((values, ctx) => {
    if (values.mode === "github" && !values.githubRepoId) {
      ctx.addIssue({ code: "custom", path: ["githubRepoId"], message: "Choose a repository to import" });
    }
    if (values.mode === "template" && !values.templateId) {
      ctx.addIssue({ code: "custom", path: ["templateId"], message: "Choose a template" });
    }
    if (values.mode === "ai" && (values.prompt ?? "").trim().length < 20) {
      ctx.addIssue({ code: "custom", path: ["prompt"], message: "Describe the application in at least 20 characters" });
    }
  });

type FormValues = z.infer<typeof formSchema>;

/**
 * The single project-creation surface. Four honest modes — blank, GitHub
 * import, template, prompt-first — with per-mode validation. Success is only
 * claimed when the service call resolves; failures keep the dialog open.
 */
export function NewProjectDialog() {
  const open = useUIStore((state) => state.newProjectOpen);
  const closeNewProject = useUIStore((state) => state.closeNewProject);
  const router = useRouter();
  const toast = useToast();

  const reposQuery = useGitHubRepositories();
  const templatesQuery = useTemplates();
  const createProject = useCreateProject();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", mode: "blank", githubRepoId: "", templateId: "", prompt: "" },
  });

  const mode = watch("mode");
  const githubRepoId = watch("githubRepoId");
  const templateId = watch("templateId");

  // Seed the form from the triggering context: deep links, template cards,
  // the Home hero prompt.
  useEffect(() => {
    if (!open) return;
    const { newProjectMode, newProjectTemplateId, newProjectPrompt } = useUIStore.getState();
    reset({
      name: "",
      description: "",
      mode: newProjectMode,
      githubRepoId: "",
      templateId: newProjectTemplateId ?? "",
      prompt: newProjectPrompt ?? "",
    });
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const project = await createProject.mutateAsync({
        name: values.name,
        description: values.description || undefined,
        mode: values.mode,
        githubRepoId: values.mode === "github" ? values.githubRepoId : undefined,
        templateId: values.mode === "template" ? values.templateId : undefined,
        prompt: values.mode === "ai" ? values.prompt : undefined,
      });
      toast.success("Project created", `${values.name} is ready in your workspace.`);
      closeNewProject();
      router.push(`/workspace?project=${project.id}`);
    } catch (error) {
      toast.error(
        "Could not create the project",
        error instanceof Error ? error.message : "Please try again in a moment.",
      );
    }
  });

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={closeNewProject}
      title="New project"
      description="Create a project from scratch, from GitHub, from a template, or from a prompt."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {/* Mode selector */}
        <div role="tablist" aria-label="Project type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODES.map((item) => {
            const Icon = item.icon;
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setValue("mode", item.id, { shouldValidate: true })}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-card border bg-card p-3 text-left transition-colors duration-150 ease-swift",
                  selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-border-strong",
                )}
              >
                <Icon className={cn("h-[18px] w-[18px]", selected ? "text-accent" : "text-muted-foreground")} aria-hidden />
                <span>
                  <span className="block text-[13px] font-medium text-foreground">{item.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Basics */}
        <div className="flex flex-col gap-3">
          <Input
            label="Project name"
            placeholder="Commerce storefront, mobile API, internal dashboard…"
            error={errors.name?.message}
            {...register("name")}
          />
          <Textarea
            label="Description (optional)"
            placeholder="One or two sentences about what this project is for."
            rows={2}
            error={errors.description?.message}
            {...register("description")}
          />
        </div>

        {/* Mode-specific section */}
        {mode === "github" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[12px] font-medium text-foreground">
              Repository to import
            </legend>
            <RepoPicker
              reposQuery={reposQuery}
              selectedId={githubRepoId || ""}
              onSelect={(id) => setValue("githubRepoId", id, { shouldValidate: true })}
              error={errors.githubRepoId?.message}
            />
          </fieldset>
        ) : null}

        {mode === "template" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[12px] font-medium text-foreground">Template</legend>
            <TemplatePicker
              templatesQuery={templatesQuery}
              selectedId={templateId || ""}
              onSelect={(id) => setValue("templateId", id, { shouldValidate: true })}
              error={errors.templateId?.message}
            />
          </fieldset>
        ) : null}

        {mode === "ai" ? (
          <Textarea
            label="Describe the application you want"
            placeholder="A web app for tracking rooftop solar installations, with customer records, appointment scheduling, and a photo upload form…"
            rows={5}
            hint="CURVIN drafts a plan and proposed structure. You review and approve before anything is created."
            error={errors.prompt?.message}
            {...register("prompt")}
          />
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5">
          <Button type="button" variant="secondary" onClick={closeNewProject}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting || createProject.isPending}>
            Create project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RepoPicker({
  reposQuery,
  selectedId,
  onSelect,
  error,
}: {
  reposQuery: ReturnType<typeof useGitHubRepositories>;
  selectedId: string;
  onSelect: (id: string) => void;
  error: string | undefined;
}) {
  const { data, isLoading, isError, refetch } = reposQuery;

  if (isLoading) {
    return (
      <div className="grid gap-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="flex flex-col items-center gap-3 p-5 text-center">
        <p className="text-[13px] text-muted-foreground">
          Could not load your GitHub repositories.
        </p>
        <Button size="sm" variant="secondary" onClick={() => void refetch()}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Repository"
      className={cn("grid max-h-64 gap-2 overflow-y-auto", error && "rounded-lg ring-1 ring-danger")}
    >
      {data.map((repo) => {
        const selected = repo.id === selectedId;
        return (
          <label
            key={repo.id}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors duration-150 ease-swift",
              selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name="github-repo"
              className="h-4 w-4 accent-[#0071e3]"
              checked={selected}
              onChange={() => onSelect(repo.id)}
            />
            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[12.5px] text-foreground">
                {repo.owner}/{repo.name}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {repo.description ?? "No description"} · {repo.primaryLanguage ?? "Unknown language"}
              </span>
            </span>
            {repo.isPrivate ? <Badge variant="outline">Private</Badge> : null}
          </label>
        );
      })}
      {error ? <p className="px-1 text-[11.5px] text-danger">{error}</p> : null}
    </div>
  );
}

function TemplatePicker({
  templatesQuery,
  selectedId,
  onSelect,
  error,
}: {
  templatesQuery: ReturnType<typeof useTemplates>;
  selectedId: string;
  onSelect: (id: string) => void;
  error: string | undefined;
}) {
  const { data, isLoading } = templatesQuery;

  if (isLoading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", error && "rounded-lg ring-1 ring-danger")}>
      <div role="radiogroup" aria-label="Template" className="grid gap-2 sm:grid-cols-2">
        {(data ?? []).map((template) => {
          const selected = template.id === selectedId;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(template.id)}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors duration-150 ease-swift",
                selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-border-strong",
              )}
            >
              <span className="text-[13px] font-medium text-foreground">{template.name}</span>
              <span className="line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {template.description}
              </span>
              <span className="flex flex-wrap gap-1">
                {template.stack.slice(0, 3).map((technology) => (
                  <Badge key={technology} variant="outline">{technology}</Badge>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="px-1 text-[11.5px] text-danger">{error}</p> : null}
    </div>
  );
}
