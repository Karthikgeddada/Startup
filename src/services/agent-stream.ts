/**
 * Real agent service (live backend mode) — the only piece of the frontend
 * that consumes the run event stream.
 *
 * `runTurn` POSTs the user message (which creates the run server-side) and
 * then reduces the run's persisted SSE event log into an AgentTurn snapshot.
 * Every block the UI renders maps to a real persisted event — nothing here
 * fabricates progress: if the run stalls, the turn stays `running` until the
 * stream guard rejects; if a tool fails, the tool block shows `failed`.
 *
 * EventSource cannot send the X-User-Id identity header, so the stream is
 * consumed with fetch + ReadableStream — which also honours the AbortSignal
 * natively, so `signal` cancels the turn end-to-end.
 */
import { env } from "@/config/env";
import { apiFetch } from "@/services/client";
import type { AgentBlock, AgentMessage, AgentTurn, PlanStep } from "@/types/domain";
import type { AgentService } from "@/services/types";

/** Dev identity placeholder — matches the backend's default user until real auth. */
const USER_ID = "user_dev";

/** Hard cap on a live turn: an un-configured gateway keeps runs in `created`
 * forever, and we reject honestly instead of hanging the UI indefinitely. */
const MAX_STREAM_MS = 10 * 60_000;

interface WireEvent {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}

type Block = Extract<AgentBlock, { kind: "tool" }>;
type ApprovalBlock = Extract<AgentBlock, { kind: "approval" }>;
type PlanBlock = Extract<AgentBlock, { kind: "plan" }>;
type TextBlock = Extract<AgentBlock, { kind: "text" }>;
type ErrorBlock = Extract<AgentBlock, { kind: "error" }>;

/** Live turns by run id — lets resolveApproval return the current snapshot. */
const liveTurns = new Map<string, AgentTurn>();

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

// --------------------------------------------------------------- SSE consumer

async function consumeEventStream(
  runId: string,
  onEvent: (event: WireEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${env.NEXT_PUBLIC_API_BASE_URL}/api/v1/runs/${runId}/events`,
    { headers: { "X-User-Id": USER_ID, Accept: "text/event-stream" }, signal },
  );
  if (!response.ok || !response.body) {
    throw new Error(`event stream failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let frameData = "";

  const dispatch = () => {
    const data = frameData.trim();
    frameData = "";
    if (!data) return;
    try {
      const parsed = JSON.parse(data) as WireEvent;
      if (parsed && typeof parsed.type === "string") onEvent(parsed);
    } catch {
      // Non-JSON keep-alive frames are ignored — never a UI crash.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line === "") {
        dispatch();
      } else if (line.startsWith("data:")) {
        frameData += line.slice(5).trimStart();
      }
      // "event:"/"id:" lines carry no extra meaning here — the payload's
      // `type` field names the event, and replay cursoring is server-side.
    }
  }
  dispatch();
}

// ------------------------------------------------------------------ reducer

function stepStatus(status: string): PlanStep["status"] {
  return status === "done" || status === "skipped" || status === "in_progress"
    ? status
    : "pending";
}

function reduce(turn: AgentTurn, event: WireEvent): void {
  const payload = event.payload ?? {};
  const blocks = turn.blocks;

  const toolBlock = (callId: string): Block | undefined =>
    blocks.find(
      (b): b is Block => b.kind === "tool" && b.id === `tool-${callId}`,
    );

  switch (event.type) {
    case "plan_generated": {
      const steps = Array.isArray(payload.steps) ? payload.steps : [];
      const planSteps: PlanStep[] = steps.map((title, index) => ({
        id: `step-${index}`,
        title: asString(title, "Untitled step"),
        status: index === 0 ? "in_progress" : "pending",
      }));
      const plan: PlanBlock = {
        kind: "plan",
        id: `plan-${turn.id}`,
        title: "Implementation plan",
        steps: planSteps,
      };
      const existing = blocks.findIndex((b) => b.kind === "plan");
      if (existing >= 0) blocks[existing] = plan;
      else blocks.splice(afterIntro(blocks), 0, plan);
      break;
    }

    case "task_started": {
      const plan = blocks.find((b): b is PlanBlock => b.kind === "plan");
      if (!plan) break;
      const description = asString(payload.description);
      const step =
        plan.steps.find((s) => s.title === description && s.status === "pending") ??
        plan.steps.find((s) => s.status === "pending");
      if (step) step.status = "in_progress";
      break;
    }

    case "task_completed": {
      const plan = blocks.find((b): b is PlanBlock => b.kind === "plan");
      if (!plan) break;
      const step = plan.steps.find((s) => s.status === "in_progress");
      if (step) step.status = "done"; // completed only with real tool evidence
      break;
    }

    case "tool_invoked": {
      const callId = asString(payload.callId, `unknown-${event.seq}`);
      const argumentsPreview = JSON.stringify(payload.arguments ?? {});
      const block: Block = {
        kind: "tool",
        id: `tool-${callId}`,
        name: asString(payload.tool, "tool"),
        status: "running",
        summary: argumentsPreview.length > 160 ? `${argumentsPreview.slice(0, 160)}…` : argumentsPreview,
        log: [`arguments: ${argumentsPreview}`],
      };
      blocks.push(block);
      break;
    }

    case "tool_dispatched": {
      const jobId = asString(payload.jobId);
      const lastTool = [...blocks].reverse().find((b): b is Block => b.kind === "tool" && b.status === "running");
      if (lastTool) lastTool.log.push(`dispatched to runner (job ${jobId})`);
      break;
    }

    case "tool_result": {
      const callId = asString(payload.callId);
      const block = toolBlock(callId);
      if (!block) break;
      const outcome = (payload.outcome ?? {}) as Record<string, unknown>;
      const ok = payload.ok === true;
      block.status = ok ? "succeeded" : "failed";
      block.summary = ok
        ? asString(outcome.summary, "completed")
        : `error: ${asString(outcome.error, "failed")}${outcome.detail ? ` — ${asString(outcome.detail)}` : ""}`;
      block.log.push(`result: ${JSON.stringify(outcome).slice(0, 500)}`);
      break;
    }

    case "approval_required": {
      const approval: ApprovalBlock = {
        kind: "approval",
        id: asString(payload.approvalId, `approval-${event.seq}`),
        title: asString(payload.title, "Approve change"),
        description: `The agent wants to run ${asString(payload.tool, "a tool")} on your machine.`,
        status: "pending",
      };
      blocks.push(approval);
      break;
    }

    case "approval_granted": {
      const approval = blocks.find(
        (b): b is ApprovalBlock =>
          b.kind === "approval" && b.id === asString(payload.approvalId),
      );
      if (approval) approval.status = "approved";
      break;
    }

    case "approval_rejected": {
      const approval = blocks.find(
        (b): b is ApprovalBlock =>
          b.kind === "approval" && b.id === asString(payload.approvalId),
      );
      if (approval) approval.status = "rejected";
      break;
    }

    case "error_occurred": {
      turn.status = "failed";
      const error: ErrorBlock = {
        kind: "error",
        id: `error-${event.seq}`,
        title: "Agent run failed",
        message: asString(payload.message, "An unexpected error occurred."),
        retryable: true,
      };
      blocks.push(error);
      break;
    }

    case "run_status_changed": {
      const to = asString(payload.to);
      if (to === "failed") turn.status = "failed";
      if (to === "waiting_for_approval") turn.status = "running"; // gate, not failure
      break;
    }

    case "run_completed": {
      const content = asString(payload.text, asString(payload.summary));
      if (content) {
        const text: TextBlock = { kind: "text", id: `text-${turn.id}`, content };
        blocks.unshift(text);
      }
      turn.status = "completed";
      break;
    }

    case "run_cancelled":
      turn.status = "cancelled";
      break;

    case "stream_end": {
      const status = asString((payload as { runStatus?: string }).runStatus);
      if (status === "completed") turn.status = "completed";
      else if (status === "failed") turn.status = "failed";
      else if (status === "cancelled") turn.status = "cancelled";
      break;
    }

    default:
      break; // llm_usage, file_inspected, file_modified, run_created, planning_started: no block
  }
}

/** Insert the plan after any leading text blocks, before tool activity. */
function afterIntro(blocks: AgentBlock[]): number {
  let index = 0;
  while (index < blocks.length && blocks[index].kind === "text") index += 1;
  return index;
}

// ------------------------------------------------------------- AgentService

async function cancelRun(runId: string): Promise<void> {
  try {
    await apiFetch(`/api/v1/runs/${runId}/cancel`, {
      method: "POST",
      headers: { "X-User-Id": USER_ID },
    });
  } catch {
    // The turn is already dead client-side; a failed cancel is not fatal.
  }
}

export const httpAgent: AgentService = {
  runTurn: async (input, onUpdate, signal) => {
    const sent = await apiFetch<{
      message: { id: string; createdAt: string };
      run: { id: string };
    }>(`/api/v1/conversations/${input.conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": USER_ID },
      body: JSON.stringify({ content: input.prompt, attachments: [] }),
    });

    const turn: AgentTurn = {
      id: sent.run.id,
      role: "agent",
      status: "running",
      createdAt: sent.message.createdAt ?? new Date().toISOString(),
      blocks: [],
    };
    const snapshot = (): AgentTurn => ({
      ...turn,
      blocks: turn.blocks.map((block) => ({ ...block })),
    });
    const publish = () => {
      const current = snapshot();
      liveTurns.set(turn.id, current);
      onUpdate(current);
    };
    publish();

    const guard = setTimeout(
      () => signal.abort(new Error("run exceeded maximum duration")),
      MAX_STREAM_MS,
    );

    try {
      await consumeEventStream(
        turn.id,
        (event) => {
          reduce(turn, event);
          publish();
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted) {
        await cancelRun(turn.id);
        liveTurns.delete(turn.id);
        throw signal.reason instanceof Error ? signal.reason : new Error("aborted");
      }
      liveTurns.delete(turn.id);
      throw error;
    } finally {
      clearTimeout(guard);
    }

    // stream_end closes the fetch; the final snapshot is authoritative.
    if (turn.status === "running") {
      // The backend closed without a terminal event — report it honestly.
      turn.status = "failed";
      turn.blocks.push({
        kind: "error",
        id: `error-${turn.id}`,
        title: "Stream ended unexpectedly",
        message: "The run event stream closed before the run reached a terminal state.",
        retryable: true,
      });
      publish();
    }
    liveTurns.delete(turn.id);
    return snapshot();
  },

  resolveApproval: async (conversationId, turnId, blockId, approved) => {
    await apiFetch(`/api/v1/approvals/${blockId}/${approved ? "approve" : "reject"}`, {
      method: "POST",
      headers: { "X-User-Id": USER_ID },
    });
    const live = liveTurns.get(turnId);
    if (live) return live;
    // Not streaming anymore (e.g. page reload) — the persisted conversation
    // holds the authoritative turn blocks.
    const conversation = await apiFetch<{
      messages: (AgentMessage & { runId?: string | null })[];
    }>(`/api/v1/conversations/${conversationId}`, {
      headers: { "X-User-Id": USER_ID },
    });
    const persisted = conversation.messages.find(
      (message): message is AgentTurn & { runId?: string | null } =>
        message.role === "agent" &&
        (message.id === turnId || message.runId === turnId),
    );
    if (persisted) return persisted;
    throw new Error("approval resolved but the agent turn could not be loaded");
  },
};
