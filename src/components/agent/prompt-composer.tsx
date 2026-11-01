"use client";

import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

import { Button, IconButton } from "@/components/ui/button";
import { cn, nextId } from "@/lib/utils";
import type { Attachment } from "@/types/domain";

interface PromptComposerProps {
  onSubmit: (text: string, attachments: Attachment[]) => void;
  placeholder?: string;
  /** Cannot submit right now (no conversation, backend unavailable…). */
  disabled?: boolean;
  /** An agent turn is in flight — shows Stop instead of Send. */
  running?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  maxChars?: number;
}

/**
 * The shared prompt composer — the same control powers the Home hero and the
 * agent panel. Multiline input, attachments, explicit submit affordance,
 * loading and disabled states.
 */
export function PromptComposer({
  onSubmit,
  placeholder = "Describe what to build, change, or investigate…",
  disabled = false,
  running = false,
  onStop,
  autoFocus = false,
  maxChars = 4000,
}: PromptComposerProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = text.trim().length > 0 && !disabled && !running;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim(), attachments);
    setText("");
    setAttachments([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = Array.from(files).map((file) => ({
      id: nextId("att"),
      name: file.name,
      kind: "file",
      sizeBytes: file.size,
    }));
    setAttachments((current) => [...current, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const overLengthThreshold = text.length > maxChars * 0.75;

  return (
    <div className="rounded-card border border-border bg-popover p-3 shadow-dropdown">
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Attached files">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex max-w-56 items-center gap-1.5 rounded-pill bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{attachment.name}</span>
              <button
                type="button"
                aria-label={`Remove attachment ${attachment.name}`}
                onClick={() =>
                  setAttachments((current) => current.filter((a) => a.id !== attachment.id))
                }
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
          tabIndex={-1}
          aria-hidden
        />
        <IconButton
          label="Attach files"
          size="sm"
          disabled={disabled || running}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" aria-hidden />
        </IconButton>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          rows={2}
          maxLength={maxChars}
          aria-label="Message the Curvin agent. Press Enter to send, Shift and Enter for a new line."
          className={cn(
            "max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[13px] leading-relaxed text-foreground outline-none",
            "placeholder:text-subtle-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />

        {running ? (
          <Button variant="secondary" size="sm" icon={<Square className="h-3.5 w-3.5" aria-hidden />} onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-9 w-9 shrink-0 rounded-pill px-0"
            icon={<ArrowUp className="h-4 w-4" aria-hidden />}
            aria-label="Send message"
            disabled={!canSubmit}
            onClick={submit}
          />
        )}
      </div>

      {overLengthThreshold ? (
        <p className="mt-1.5 text-right text-[11px] text-muted-foreground" aria-live="polite">
          {maxChars - text.length} characters remaining
        </p>
      ) : null}
    </div>
  );
}
