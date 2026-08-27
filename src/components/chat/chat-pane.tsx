import "./chat-pane.css";

import { useEffect, useRef, useState } from "react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { Select } from "~/components/ui/select";
import { Menu } from "~/components/ui/menu";
import type { MenuEntry } from "~/components/ui/menu";
import { Tooltip } from "~/components/ui/tooltip";
import { ListFilter, X } from "lucide-react";

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
  const [pinned, setPinned] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Only follow the stream while the reader is already at the bottom. Scrolling
  // up to re-read something must not be yanked back down on the next token.
  useEffect(() => {
    if (!pinned) {
      return;
    }
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages.length, streaming, pinned]);

  useEffect(() => {
    if (!selection) {
      return;
    }
    inputRef.current?.focus();
  }, [selection]);

  if (!chatOpen) {
    return (
      <button type="button" className="chat-reopen" onClick={() => setChatOpen(true)}>
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

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    setPinned(distance < 60);
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
    <section className="chat">
      <header className="chat-head" data-tauri-drag-region>
        <span className="label" data-tauri-drag-region>
          Chat
        </span>
        <div className="spacer" data-tauri-drag-region />
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
          <button type="button" className="ghost-button" onClick={() => resetChat()}>
            Clear
          </button>
        ) : null}
        <Tooltip label="Hide the chat pane (⌘\\)">
          <button
            type="button"
            className="icon-button"
            aria-label="Hide the chat pane"
            onClick={() => setChatOpen(false)}
          >
<X size={12} strokeWidth={2.2} />
          </button>
        </Tooltip>
      </header>

      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {!thread ? <div className="hint pad">Open a story to start asking about it.</div> : null}

        {thread && messages.length === 0 && !busy ? (
          <div className="starters">
            <p className="hint">
              The whole thread and the article are already loaded. Ask anything, or start with:
            </p>
            {presets.map((preset) => (
              <button key={preset.id} type="button" onClick={() => runPreset(preset.id)}>
                <span className="starter-label">{preset.label}</span>
                <span className="starter-prompt">{preset.prompt}</span>
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className={`bubble ${message.role}`}>
            {message.role === "assistant" ? (
              <>
                <Markdown source={message.content} onJump={(id) => jumpToComment(id)} />
                <div className="bubble-actions">
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
          <div className="bubble assistant">
            {streaming ? (
              <Markdown source={streaming} onJump={(id) => jumpToComment(id)} />
            ) : (
              <span className="muted">Thinking…</span>
            )}
            <span className="caret" />
          </div>
        ) : null}

        {error ? <div className="inline-error">{error}</div> : null}
      </div>

      {!pinned && (busy || messages.length > 0) ? (
        <button type="button" className="jump-latest" onClick={jumpToLatest}>
          Jump to latest ↓
        </button>
      ) : null}

      {selection ? (
        <div className="selection-chip">
          <span className="selection-text">{selection.text}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Drop the highlighted passage"
            onClick={() => setSelection(null)}
          >
<X size={12} strokeWidth={2.2} />
          </button>
        </div>
      ) : null}

      <div className="chat-input">
        <textarea
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
          <div className="preset-name">
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
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                addPreset(presetName, draft);
                setNaming(false);
                setPresetName("");
              }}
            >
              Save
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setNaming(false);
                setPresetName("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : null}

        <div className="chat-input-foot">
          <Select
            size="sm"
            ariaLabel="Model used for chat"
            value={models.chat ?? ""}
            options={options}
            resolved={resolved}
            onChange={(next) => setModelFor("chat", next || null)}
          />
          <span className="fine">{busy ? "Streaming…" : "⏎ to send"}</span>
          <div className="spacer" />
          {busy ? (
            <button type="button" className="ghost-button" onClick={() => stopChat()}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="primary-button small"
              disabled={!thread || !draft.trim()}
              onClick={submit}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
