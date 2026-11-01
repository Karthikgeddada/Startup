"use client";

import { ArrowLeft, MessagesSquare, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { AgentMark } from "@/components/brand/agent-mark";
import { AgentTurnView, UserMessageView } from "@/components/agent/agent-message";
import { PromptComposer } from "@/components/agent/prompt-composer";
import { Badge } from "@/components/ui/badge";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState, SkeletonText } from "@/components/ui/feedback";
import { useConversations, useCreateConversation, useProjects } from "@/hooks/use-services";
import { env, services } from "@/services";
import { cn } from "@/lib/utils";
import { formatRelativeTime, truncate } from "@/lib/format";
import { useAgentStore } from "@/stores/agent-store";
import { useUIStore } from "@/stores/ui-store";
import type { Attachment, AgentTurn } from "@/types/domain";

/**
 * The CURVIN agent panel — the product's signature experience.
 * Opens from the right, preserves conversation state while closed, and keeps
 * in-flight turns across navigation. All agent activity runs through the
 * service layer; with mock adapters on, the header carries a visible
 * "Demo data" badge so nothing masquerades as real execution.
 */
export function AgentPanel() {
  const open = useUIStore((state) => state.agentPanelOpen);
  const setAgentPanelOpen = useUIStore((state) => state.setAgentPanelOpen);

  if (typeof document === "undefined") return null;

  const panel = <AgentPanelBody />;

  return (
    <>
      {/* Desktop: inline right column */}
      <aside
        aria-label="Curvin agent"
        aria-hidden={!open}
        className={cn(
          "hidden shrink-0 flex-col border-l border-border bg-background transition-[width] duration-200 ease-swift md:flex",
          !open && "pointer-events-none w-0 overflow-hidden border-l-0",
        )}
        style={open ? { width: "var(--agent-panel-width)" } : undefined}
      >
        {panel}
      </aside>

      {/* Mobile / tablet: overlay drawer */}
      {open ? (
        <div className="fixed inset-0 z-[85] md:hidden">
          <div aria-hidden onClick={() => setAgentPanelOpen(false)} className="absolute inset-0 bg-black/40 animate-fade-in" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Curvin agent"
            className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-border bg-background shadow-overlay animate-fade-in"
          >
            {panel}
          </div>
        </div>
      ) : null}
    </>
  );
}

function AgentPanelBody() {
  const setAgentPanelOpen = useUIStore((state) => state.setAgentPanelOpen);

  const activeConversationId = useAgentStore((state) => state.activeConversationId);
  const setActiveConversation = useAgentStore((state) => state.setActiveConversation);
  const contextProjectId = useAgentStore((state) => state.contextProjectId);
  const setContextProject = useAgentStore((state) => state.setContextProject);
  const hydrateMessages = useAgentStore((state) => state.hydrateMessages);
  const appendMessage = useAgentStore((state) => state.appendMessage);
  const updateTurn = useAgentStore((state) => state.updateTurn);
  const liveMessagesMap = useAgentStore((state) => state.messages);

  const conversationsQuery = useConversations();
  const projectsQuery = useProjects();
  const createConversation = useCreateConversation();

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversations = conversationsQuery.data;
  const projects = projectsQuery.data;
  const liveMessages = activeConversationId ? liveMessagesMap[activeConversationId] : undefined;

  const isRunning =
    liveMessages?.some((message) => message.role === "agent" && message.status === "running") ?? false;

  // Presence flag for the hydrate effect below — guarded so a null conversation id
  // never indexes the messages map (typed as Record<string, AgentMessage[]>).
  const hasLiveMessages = Boolean(activeConversationId && liveMessagesMap[activeConversationId]);

  // Hydrate the selected conversation from the service once.
  useEffect(() => {
    if (!activeConversationId || liveMessagesMap[activeConversationId]) return;
    let cancelled = false;
    void services.conversations.getConversation(activeConversationId).then((conversation) => {
      if (!cancelled && conversation) {
        hydrateMessages(conversation.id, conversation.messages);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liveMessagesMap identity changes on every hydrate; only the presence flag matters.
  }, [activeConversationId, hydrateMessages, hasLiveMessages]);

  // Keep the newest turn in view as blocks stream in.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [liveMessages?.length]);

  const startConversation = async (firstPrompt?: string) => {
    const conversation = await createConversation.mutateAsync({
      title: firstPrompt ? truncate(firstPrompt, 42) : "New conversation",
      projectId: contextProjectId,
    });
    setActiveConversation(conversation.id);
    hydrateMessages(conversation.id, []);
    useUIStore.getState().setAgentPanelOpen(true);
    if (firstPrompt) {
      void sendMessage(conversation.id, firstPrompt, []);
    }
  };

  const sendMessage = async (
    conversationId: string,
    prompt: string,
    attachments: Attachment[],
  ) => {
    appendMessage(conversationId, {
      id: `msg-${Date.now()}`,
      role: "user",
      content: prompt,
      attachments,
      createdAt: new Date().toISOString(),
    });

    const controller = new AbortController();
    abortRef.current = controller;

    await services.agent.runTurn(
      { conversationId, prompt, projectId: contextProjectId },
      (turn) => {
        const store = useAgentStore.getState();
        const exists = store.messages[conversationId]?.some((message) => message.id === turn.id);
        if (exists) store.updateTurn(conversationId, turn);
        else store.appendMessage(conversationId, turn);
      },
      controller.signal,
    );

    abortRef.current = null;
  };

  const handleApproval = async (turn: AgentTurn, blockId: string, approved: boolean) => {
    if (!activeConversationId) return;
    const updated = await services.agent.resolveApproval(
      activeConversationId,
      turn.id,
      blockId,
      approved,
    );
    updateTurn(activeConversationId, updated);
  };

  const handleRetry = (turn: AgentTurn) => {
    if (!activeConversationId) return;
    const lastPrompt = [...(liveMessages ?? [])]
      .reverse()
      .find((message) => message.role === "user");
    if (!lastPrompt || lastPrompt.role !== "user") return;
    void sendMessage(activeConversationId, lastPrompt.content, lastPrompt.attachments);
  };

  const activeConversation = conversations?.find((c) => c.id === activeConversationId);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* Panel header */}
      <div className="flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-border px-3.5">
        <AgentMark size={20} active={isRunning} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Curvin Agent</p>
          <p className="text-[11px] text-muted-foreground">
            {isRunning ? "Working…" : "Ready"}
          </p>
        </div>
        {env.useMocks ? (
          <Badge variant="warning" className="ml-1">
            Demo data
          </Badge>
        ) : null}
        <span className="flex-1" />
        <IconButton
          label="New conversation"
          size="sm"
          onClick={() => void startConversation()}
          disabled={createConversation.isPending}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </IconButton>
        <IconButton label="Close agent panel" size="sm" onClick={() => setAgentPanelOpen(false)}>
          <X className="h-4 w-4" aria-hidden />
        </IconButton>
      </div>

      {/* Context selector */}
      {activeConversationId ? (
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2">
          <label htmlFor="agent-context-project" className="text-[11px] font-medium text-muted-foreground">
            Context
          </label>
          <select
            id="agent-context-project"
            value={contextProjectId ?? ""}
            onChange={(event) => setContextProject(event.target.value || null)}
            className="h-7 flex-1 truncate rounded-lg border border-input bg-background px-2 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Account level — no project</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.repository ? ` · ${project.repository.owner}/${project.repository.name}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {activeConversationId ? (
        <>
          {/* Messages */}
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4"
            aria-live="polite"
            aria-label="Conversation"
          >
            <button
              type="button"
              onClick={() => setActiveConversation(null)}
              className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              All conversations
            </button>

            {liveMessages === undefined ? (
              <div className="flex flex-col gap-6">
                <SkeletonText lines={3} />
                <SkeletonText lines={2} />
              </div>
            ) : liveMessages.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={<MessagesSquare className="h-5 w-5" aria-hidden />}
                  title={activeConversation?.title ?? "New conversation"}
                  description="Describe what you want to build, change, or understand. The agent plans, proposes diffs, and waits for your approval before anything is applied."
                />
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {liveMessages.map((message) =>
                  message.role === "user" ? (
                    <UserMessageView key={message.id} message={message} />
                  ) : (
                    <AgentTurnView
                      key={message.id}
                      turn={message}
                      busy={isRunning}
                      onApprove={(turn, blockId) => void handleApproval(turn, blockId, true)}
                      onReject={(turn, blockId) => void handleApproval(turn, blockId, false)}
                      onRetry={handleRetry}
                    />
                  ),
                )}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="shrink-0 border-t border-border p-3">
            <PromptComposer
              autoFocus
              running={isRunning}
              onStop={() => abortRef.current?.abort()}
              onSubmit={(text, attachments) => void sendMessage(activeConversationId, text, attachments)}
            />
          </div>
        </>
      ) : (
        <ConversationList
          conversations={conversations}
          isLoading={conversationsQuery.isLoading}
          onSelect={(id) => setActiveConversation(id)}
          onNew={() => void startConversation()}
          creating={createConversation.isPending}
        />
      )}
    </div>
  );
}

function ConversationList({
  conversations,
  isLoading,
  onSelect,
  onNew,
  creating,
}: {
  conversations: { id: string; title: string; projectId: string | null; updatedAt: string }[] | undefined;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
      <Button icon={<Plus className="h-4 w-4" aria-hidden />} loading={creating} onClick={onNew}>
        New conversation
      </Button>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <SkeletonText lines={4} />
        </div>
      ) : !conversations || conversations.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="h-5 w-5" aria-hidden />}
          title="No conversations yet"
          description="Start one to plan work, ask about a repository, or have Curvin propose changes."
        />
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Conversations">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ease-swift hover:bg-muted"
              >
                <span className="w-full truncate text-[13px] font-medium text-foreground">
                  {conversation.title}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {formatRelativeTime(conversation.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
