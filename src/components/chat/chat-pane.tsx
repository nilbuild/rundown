import { InlineError } from "~/components/ui/inline-error";
import { useEffect, useRef, useState } from "react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { Select } from "~/components/ui/select";
import { Menu } from "~/components/ui/menu";
import type { MenuEntry } from "~/components/ui/menu";
import { Tooltip } from "~/components/ui/tooltip";
import { ListFilter, X } from "lucide-react";
import { GhostButton } from "~/components/ui/ghost-button";
import { IconButton } from "~/components/ui/icon-button";
import { PrimaryButton } from "~/components/ui/primary-button";
import { cn } from "~/utils/classname";
import { usePinnedScroll } from "~/hooks/use-pinned-scroll";

export function ChatPane() {
  const thread = useApp((state) => state.thread);
  const messages = useApp((state) => state.chatMessages);
  const streaming = useApp((state) => state.chatStreaming);
  const busy = useApp((state) => state.chatBusy);
  const error = useApp((state) => state.chatError);
  const selection = useApp((state) => state.selection);
  const chatOpen = useApp((state) => state.chatOpen);
  const models = useApp((state) => state.models);
  const options = useApp((state) => state.modelOptions);
  const resolved = useApp((state) => state.modelResolved);

  const sendChat = useApp((state) => state.sendChat);
  const stopChat = useApp((state) => state.stopChat);
  const resetChat = useApp((state) => state.resetChat);
  const setSelection = useApp((state) => state.setSelection);
  const setChatOpen = useApp((state) => state.setChatOpen);
  const jumpToComment = useApp((state) => state.jumpToComment);
  const setModelFor = useApp((state) => state.setModelFor);
  const presets = useApp((state) => state.presets);
  const runPreset = useApp((state) => state.runPreset);
  const addPreset = useApp((state) => state.addPreset);
  const setPresetsOpen = useApp((state) => state.setPresetsOpen);

  const [draft, setDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState("");
  const { ref: scrollRef, pinned, setPinned, onScroll } = usePinnedScroll([messages.length, streaming]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!selection) {
      return;
    }
    inputRef.current?.focus();
  }, [selection]);

  if (!chatOpen) {
    return (
      <button
        type="button"
        className="fixed right-4 bottom-4 z-10 rounded-[20px] bg-accent px-4 py-2 text-[12.5px] font-[550] text-white shadow-panel"
        onClick={() => setChatOpen(true)}
      >
        Chat
      </button>
    );
  }

  const submit = () => {
    const value = draft.trim();
    if (!value || busy) {
      return;
    }
    setDraft("");
    setPinned(true);
    sendChat(value);
  };

  const presetEntries: MenuEntry[] = presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    hint: preset.prompt,
    onSelect: () => runPreset(preset.id),
  }));

  const presetFooter: MenuEntry[] = [];
  if (draft.trim()) {
    presetFooter.push({
      id: "save",
      label: "Save this question as a preset",
      onSelect: () => {
        setPresetName("");
        setNaming(true);
      },
    });
  }
  presetFooter.push({
    id: "manage",
    label: "Manage presets…",
    onSelect: () => setPresetsOpen(true),
  });

  const jumpToLatest = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    setPinned(true);
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  };

  return (
    <section className="flex min-h-0 flex-col border-l border-line bg-panel-2">
      <header
        className="flex items-center gap-2 border-b border-line-soft pt-9 pr-2.5 pb-4 pl-3.5"
        data-tauri-drag-region
      >
        <span
          className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase"
          data-tauri-drag-region
        >
          Chat
        </span>
        <div className="flex-1" data-tauri-drag-region />
        <Menu
          ariaLabel="Saved questions"
          entries={presetEntries}
          footer={presetFooter}
          trigger={
            <>
              <ListFilter size={12} strokeWidth={2} />
              Presets
            </>
          }
        />
        {messages.length > 0 ? (
          <GhostButton onClick={() => resetChat()}>
            Clear
          </GhostButton>
        ) : null}
        <Tooltip label="Hide the chat pane (⌘\\)">
          <IconButton
           
           
            aria-label="Hide the chat pane"
            onClick={() => setChatOpen(false)}
          >
<X size={12} strokeWidth={2.2} />
          </IconButton>
        </Tooltip>
      </header>

      <div className="flex-1 overflow-y-auto px-3.5 pt-3.5 pb-2" ref={scrollRef} onScroll={onScroll}>
        {!thread ? <div className="px-8 py-7 text-[13px] text-muted">Open a story to start asking about it.</div> : null}

        {thread && messages.length === 0 && !busy ? (
          <div className="flex flex-wrap gap-1.5">
            <p className="m-0 mb-0.5 w-full text-[13px] text-muted">
              The whole thread and the article are already loaded. Ask anything, or start with:
            </p>
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-lg border border-line bg-panel px-[11px] py-1.5 text-left text-[12.5px] leading-[1.45] font-[550] text-fg-soft transition-[border-color] duration-[120ms] hover:border-accent hover:text-fg"
                title={preset.prompt}
                onClick={() => runPreset(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "group/bubble mb-3.5 text-[13px] leading-[1.6]",
              message.role === "user"
                ? "rounded-[10px] bg-accent-soft px-3 py-[9px] text-fg [&_blockquote]:mb-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-2.5 [&_blockquote]:text-xs [&_blockquote]:text-muted"
                : "text-fg-soft",
            )}
          >
            {message.role === "assistant" ? (
              <>
                <Markdown source={message.content} onJump={(id) => jumpToComment(id)} />
                <div className="mt-1.5 flex gap-1 opacity-0 transition-opacity duration-[120ms] group-hover/bubble:opacity-100 [&_button]:rounded-md [&_button]:border [&_button]:border-line [&_button]:bg-line-soft [&_button]:px-2 [&_button]:py-0.5 [&_button]:text-[11px] [&_button]:text-muted [&_button:hover]:bg-line [&_button:hover]:text-fg">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(message.content)}
                  >
                    Copy
                  </button>
                </div>
              </>
            ) : (
              <Markdown source={message.content} />
            )}
          </div>
        ))}

        {busy ? (
          <div className="group/bubble mb-3.5 text-[13px] leading-[1.6] text-fg-soft">
            {streaming ? (
              <Markdown source={streaming} onJump={(id) => jumpToComment(id)} />
            ) : (
              <span className="text-muted">Thinking…</span>
            )}
            <span className="ml-0.5 inline-block h-[15px] w-[7px] bg-accent align-text-bottom animate-caret" />
          </div>
        ) : null}

        {error ? <InlineError message={error} /> : null}
      </div>

      {!pinned && (busy || messages.length > 0) ? (
        <button type="button" className="mb-2 self-center rounded-[20px] bg-accent px-3 py-[5px] text-[11.5px] font-[550] text-white shadow-panel" onClick={jumpToLatest}>
          Jump to latest ↓
        </button>
      ) : null}

      {selection ? (
        <div className="mx-3.5 mb-2 flex items-start gap-2 rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_24%,transparent)] bg-[color-mix(in_srgb,var(--accent)_9%,var(--panel))] py-[9px] pr-[9px] pl-3 text-xs">
          <span className="line-clamp-3 flex-1 text-fg-soft">{selection.text}</span>
          <IconButton
           
           
            aria-label="Drop the highlighted passage"
            onClick={() => setSelection(null)}
          >
<X size={12} strokeWidth={2.2} />
          </IconButton>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-line-soft px-3.5 pt-3 pb-3.5">
        <textarea
          className="w-full resize-none rounded-[9px] border border-line bg-panel px-[11px] py-[9px] text-[13px] leading-[1.5] outline-none transition-[border-color] duration-[120ms] placeholder:text-muted focus:border-accent disabled:opacity-55"
          ref={inputRef}
          value={draft}
          rows={2}
          placeholder={thread ? "Ask about this thread…" : "Open a story first"}
          disabled={!thread}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {naming ? (
          <div className="mb-0.5 flex items-center gap-1.5">
            <input
              value={presetName}
              placeholder="Name this preset"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNaming(false);
                  setPresetName("");
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  addPreset(presetName, draft);
                  setNaming(false);
                  setPresetName("");
                }
              }}
            />
            <GhostButton
             
             
              onClick={() => {
                addPreset(presetName, draft);
                setNaming(false);
                setPresetName("");
              }}
            >
              Save
            </GhostButton>
            <GhostButton
             
             
              onClick={() => {
                setNaming(false);
                setPresetName("");
              }}
            >
              Cancel
            </GhostButton>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Select
            size="sm"
            ariaLabel="Model used for chat"
            value={models.chat ?? ""}
            options={options}
            resolved={resolved}
            onChange={(next) => setModelFor("chat", next || null)}
          />
          <span className="text-[11px] whitespace-nowrap text-muted">{busy ? "Streaming…" : "⏎ to send"}</span>
          <div className="flex-1" />
          {busy ? (
            <GhostButton onClick={() => stopChat()}>
              Stop
            </GhostButton>
          ) : (
            <PrimaryButton
             
             
              disabled={!thread || !draft.trim()}
              onClick={submit} small>
              Send
            </PrimaryButton>
          )}
        </div>
      </div>
    </section>
  );
}
