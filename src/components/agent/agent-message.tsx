"use client";

import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Loader2,
  RotateCcw,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import type { AgentBlock, AgentTurn, UserMessage } from "@/types/domain";

/**
 * Structured agent message rendering: plans, tool activity with expandable
 * logs, diff previews, approval controls, and error states. Every block type
 * the agent emits has an explicit, honest visual treatment. All prop types
 * come straight from the domain model unions.
 */
export function UserMessageView({ message }: { message: UserMessage }) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="max-w-[85%] rounded-card rounded-br-md bg-accent px-4 py-2.5 text-[13px] leading-relaxed text-accent-foreground">
        {message.content}
      </div>
      {message.attachments.length > 0 ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {message.attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="rounded-pill bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              {attachment.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AgentTurnView({
  turn,
  onApprove,
  onReject,
  onRetry,
  busy,
}: {
  turn: AgentTurn;
  onApprove: (turn: AgentTurn, blockId: string) => void;
  onReject: (turn: AgentTurn, blockId: string) => void;
  onRetry: (turn: AgentTurn) => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-3" aria-label="Curvin agent response">
      {turn.blocks.map((block) => (
        <AgentBlockView
          key={block.id}
          block={block}
          turn={turn}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
          busy={busy}
        />
      ))}
      {turn.status === "running" ? (
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground" aria-live="polite">
          <Spinner size={13} /> Working — running tools and preparing results…
        </p>
      ) : null}
    </div>
  );
}

function AgentBlockView({
  block,
  turn,
  onApprove,
  onReject,
  onRetry,
  busy,
}: {
  block: AgentBlock;
  turn: AgentTurn;
  onApprove: (turn: AgentTurn, blockId: string) => void;
  onReject: (turn: AgentTurn, blockId: string) => void;
  onRetry: (turn: AgentTurn) => void;
  busy: boolean;
}) {
  switch (block.kind) {
    case "text":
      return <p className="text-[13px] leading-relaxed text-foreground">{block.content}</p>;

    case "plan":
      return (
        <div className="rounded-card bg-card p-4">
          <p className="text-[12px] font-semibold text-foreground">{block.title}</p>
          <ol className="mt-2.5 flex flex-col gap-2">
            {block.steps.map((step) => (
              <li key={step.id} className="flex items-center gap-2.5 text-[12.5px]">
                <StepIcon status={step.status} />
                <span
                  className={cn(
                    step.status === "done" ? "text-muted-foreground" : "text-foreground",
                    step.status === "skipped" && "text-muted-foreground line-through",
                  )}
                >
                  {step.title}
                </span>
              </li>
            ))}
          </ol>
        </div>
      );

    case "tool":
      return <ToolBlock block={block} />;

    case "diff":
      return (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center justify-between gap-3 bg-muted px-3 py-2">
            <span className="truncate font-mono text-[11px] text-muted-foreground">{block.filePath}</span>
            <span className="shrink-0 font-mono text-[11px]">
              <span className="text-success">+{block.additions}</span>{" "}
              <span className="text-danger">−{block.deletions}</span>
            </span>
          </div>
          <div className="overflow-x-auto py-1.5 font-mono text-[11.5px] leading-5">
            {block.lines.map((line, index) => (
              <div
                key={index}
                className={cn(
                  "whitespace-pre px-3",
                  line.type === "add" && "bg-success-soft text-success",
                  line.type === "del" && "bg-danger-soft text-danger",
                  line.type === "ctx" && "text-muted-foreground",
                )}
              >
                {line.type === "add" ? "+ " : line.type === "del" ? "− " : "  "}
                {line.text}
              </div>
            ))}
          </div>
        </div>
      );

    case "approval":
      return (
        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium text-foreground">{block.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{block.description}</p>
            </div>
            {block.status === "pending" ? (
              <Badge variant="warning" dot>Pending</Badge>
            ) : block.status === "approved" ? (
              <Badge variant="success" dot>Approved</Badge>
            ) : (
              <Badge variant="neutral" dot>Rejected</Badge>
            )}
          </div>
          {block.status === "pending" ? (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" disabled={busy} onClick={() => onApprove(turn, block.id)}>
                Approve change
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onReject(turn, block.id)}>
                Reject
              </Button>
            </div>
          ) : null}
        </div>
      );

    case "error":
      return (
        <div className="rounded-card border border-danger bg-danger-soft p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
            {block.title}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-danger">{block.message}</p>
          {block.retryable ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
              onClick={() => onRetry(turn)}
            >
              Retry
            </Button>
          ) : null}
        </div>
      );
  }
}

function StepIcon({ status }: { status: "pending" | "in_progress" | "done" | "skipped" }) {
  if (status === "done") return <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />;
  if (status === "in_progress")
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden />;
  if (status === "skipped") return <CircleX className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function ToolBlock({
  block,
}: {
  block: Extract<AgentBlock, { kind: "tool" }>;
}) {
  const [showLog, setShowLog] = useState(false);

  return (
    <div className="rounded-card bg-card p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            block.status === "succeeded" && "bg-success-soft text-success",
            block.status === "failed" && "bg-danger-soft text-danger",
            (block.status === "running" || block.status === "pending") && "bg-muted text-muted-foreground",
          )}
        >
          {block.status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Terminal className="h-4 w-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-foreground">
            {block.name}
            {block.status === "running" ? (
              <Badge variant="accent">Running</Badge>
            ) : block.status === "succeeded" ? (
              <Badge variant="success">Succeeded</Badge>
            ) : block.status === "failed" ? (
              <Badge variant="danger">Failed</Badge>
            ) : (
              <Badge>Queued</Badge>
            )}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{block.summary}</p>
        </div>
        {block.log.length > 0 ? (
          <button
            type="button"
            aria-expanded={showLog}
            aria-label={showLog ? "Hide execution log" : "Show execution log"}
            onClick={() => setShowLog((value) => !value)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
          >
            Log
            {showLog ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
          </button>
        ) : null}
      </div>
      {showLog ? (
        <pre className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {block.log.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
