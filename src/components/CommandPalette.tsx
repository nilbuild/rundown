import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/app";
import type { FeedName } from "../lib/types";

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useApp((state) => state.paletteOpen);
  const setOpen = useApp((state) => state.setPaletteOpen);
  const setFeed = useApp((state) => state.setFeed);
  const setTab = useApp((state) => state.setTab);
  const runOutput = useApp((state) => state.runOutput);
  const reloadStory = useApp((state) => state.reloadStory);
  const setSettingsOpen = useApp((state) => state.setSettingsOpen);
  const setPresetsOpen = useApp((state) => state.setPresetsOpen);
  const setChatOpen = useApp((state) => state.setChatOpen);
  const resetChat = useApp((state) => state.resetChat);
  const collapseAll = useApp((state) => state.collapseAll);
  const expandAll = useApp((state) => state.expandAll);
  const runSearch = useApp((state) => state.runSearch);
  const prefetch = useApp((state) => state.prefetch);
  const setPrefetch = useApp((state) => state.setPrefetch);
  const thread = useApp((state) => state.thread);
  const chatOpen = useApp((state) => state.chatOpen);

  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const feeds: FeedName[] = ["top", "best", "new", "ask", "show", "jobs"];
    const list: Command[] = [
      {
        id: "digest",
        label: "Digest this thread",
        hint: "⌘D",
        run: () => {
          setTab("digest");
          runOutput("digest");
        },
      },
      { id: "brief", label: "Summarise the article", run: () => { setTab("article"); runOutput("brief"); } },
      { id: "tab-article", label: "Go to Article", run: () => setTab("article") },
      { id: "tab-comments", label: "Go to Comments", run: () => setTab("comments") },
      {
        id: "chat",
        label: chatOpen ? "Hide the chat pane" : "Show the chat pane",
        run: () => setChatOpen(!chatOpen),
      },
      { id: "chat-reset", label: "Clear this conversation", run: () => resetChat() },
      { id: "collapse", label: "Collapse all comments", run: () => collapseAll() },
      { id: "expand", label: "Expand all comments", run: () => expandAll() },
      { id: "reload", label: "Reload this thread", hint: "⌘R", run: () => reloadStory() },
      {
        id: "prefetch",
        label: prefetch === "off" ? "Generate rundowns early" : "Stop generating early",
        run: () => setPrefetch(prefetch === "off" ? "rundown" : "off"),
      },
      { id: "presets", label: "Presets", hint: "⌘P", run: () => setPresetsOpen(true) },
      { id: "settings", label: "Settings", hint: "⌘,", run: () => setSettingsOpen(true) },
    ];

    feeds.forEach((feed) => {
      list.push({
        id: `feed-${feed}`,
        label: `Feed: ${feed[0].toUpperCase()}${feed.slice(1)}`,
        run: () => setFeed(feed),
      });
    });

    if (!thread) {
      return list.filter(
        (command) =>
          !["digest", "brief", "reload", "chat-reset", "collapse", "expand"].includes(command.id),
      );
    }
    return list;
  }, [
    chatOpen,
    prefetch,
    setPrefetch,
    thread,
    setTab,
    runOutput,
    setChatOpen,
    resetChat,
    collapseAll,
    expandAll,
    reloadStory,
    setSettingsOpen,
    setPresetsOpen,
    setFeed,
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return commands;
    }
    if (needle.startsWith("?")) {
      return [];
    }
    return commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setCursor(0);
    window.setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  if (!open) {
    return null;
  }

  const searchMode = query.trim().startsWith("?");

  const commit = () => {
    if (searchMode) {
      runSearch(query.trim().slice(1).trim());
      setOpen(false);
      return;
    }
    const command = filtered[cursor];
    if (!command) {
      return;
    }
    command.run();
    setOpen(false);
  };

  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          placeholder="Run a command, or type ? to search Hacker News"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((current) => Math.min(current + 1, filtered.length - 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((current) => Math.max(current - 1, 0));
            }
          }}
        />

        <div className="palette-list">
          {searchMode ? (
            <div className="palette-row active">
              <span>Search Hacker News for “{query.trim().slice(1).trim()}”</span>
            </div>
          ) : null}

          {!searchMode && filtered.length === 0 ? (
            <div className="palette-row muted">No matching command</div>
          ) : null}

          {!searchMode
            ? filtered.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  className={`palette-row ${index === cursor ? "active" : ""}`}
                  onMouseEnter={() => setCursor(index)}
                  onClick={commit}
                >
                  <span>{command.label}</span>
                  {command.hint ? <kbd>{command.hint}</kbd> : null}
                </button>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
