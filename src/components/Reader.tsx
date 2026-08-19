import { useEffect, useRef } from "react";
import { useApp } from "../state/app";
import { ArticleView } from "./ArticleView";
import { CommentsView } from "./CommentsView";
import { OutputView } from "./OutputView";
import { RundownView } from "./RundownView";
import { openExternal } from "../lib/api";
import { CommentsSkeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";
import { compact, hnLink, timeAgo } from "../lib/format";
import type { Tab } from "../state/app";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "rundown", label: "Rundown", hint: "The whole story in plain words" },
  { key: "article", label: "Article", hint: "The linked page, cleaned up" },
  { key: "comments", label: "Comments", hint: "The thread itself" },
  { key: "digest", label: "Digest", hint: "The thinking worth keeping" },
];

export function Reader() {
  const thread = useApp((state) => state.thread);
  const loading = useApp((state) => state.loadingThread);
  const error = useApp((state) => state.threadError);
  const tab = useApp((state) => state.tab);
  const outputs = useApp((state) => state.outputs);
  const setTab = useApp((state) => state.setTab);
  const reloadStory = useApp((state) => state.reloadStory);
  const provider = useApp((state) => state.provider);
  const providerStatus = useApp((state) => state.providerStatus);
  const setSettingsOpen = useApp((state) => state.setSettingsOpen);
  const newComments = useApp((state) => state.newComments);
  const scrollRef = useRef<HTMLDivElement>(null);

  const providerMissing =
    providerStatus !== null &&
    (provider === "claude" ? !providerStatus.claude : !providerStatus.codex);

  const notice = providerMissing ? (
    <div className="notice">
      <span>
        The <code>{provider}</code> command was not found on your PATH, so nothing can be generated.
      </span>
      <button type="button" onClick={() => setSettingsOpen(true)}>
        Settings
      </button>
    </div>
  ) : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab, thread?.id]);

  // The reading pane is a div, so it gets no keyboard scrolling for free.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const node = scrollRef.current;
      if (!node) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }
      if (target && target.isContentEditable) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const page = node.clientHeight * 0.9;
      const step = 90;

      const move = (top: number, smooth = true) => {
        event.preventDefault();
        node.scrollBy({ top, behavior: smooth ? "smooth" : "auto" });
      };

      if (event.key === " ") {
        move(event.shiftKey ? -page : page);
        return;
      }
      if (event.key === "PageDown") {
        move(page);
        return;
      }
      if (event.key === "PageUp") {
        move(-page);
        return;
      }
      if (event.key === "ArrowDown") {
        move(step, false);
        return;
      }
      if (event.key === "ArrowUp") {
        move(-step, false);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        node.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (loading) {
    return (
      <main className="reader">
        {notice}
        <header className="reader-head reader-head-loading" data-tauri-drag-region>
          <div className="sk" style={{ width: "52%", height: 17 }} data-tauri-drag-region />
          <div
            className="sk"
            style={{ width: "30%", height: 11, marginTop: 10 }}
            data-tauri-drag-region
          />
        </header>
        <div className="reader-scroll">
          <div className="comments">
            <CommentsSkeleton />
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="reader">
        {notice}
        <ErrorState
          title="Could not load this thread"
          message={error}
          onRetry={() => reloadStory()}
        />
      </main>
    );
  }

  if (!thread) {
    return (
      <main className="reader">
        {notice}
        <div className="empty-state welcome">
          <h2>Pick a story</h2>
          <p>
            Read the article, read the thread, or ask for a digest of what people actually argued.
            Every quote in a digest is checked against the comment it came from.
          </p>
          <p className="fine">⌘K for the command palette · j and k move through the list</p>
        </div>
      </main>
    );
  }

  return (
    <main className="reader">
      {notice}
      <header className="reader-head" data-tauri-drag-region>
        {/* The title is the window's drag handle, as it would be on any Mac
            window. Opening the discussion moved to an explicit control below. */}
        <h1 data-tauri-drag-region>{thread.title}</h1>

        <div className="reader-meta" data-tauri-drag-region>
          {thread.domain ? (
            <button
              type="button"
              className="link"
              onClick={() => thread.url && openExternal(thread.url)}
            >
              {thread.domain} ↗
            </button>
          ) : null}
          {thread.points !== null ? (
            <span data-tauri-drag-region>{compact(thread.points)} points</span>
          ) : null}
          {thread.author ? <span data-tauri-drag-region>by {thread.author}</span> : null}
          <span data-tauri-drag-region>{compact(thread.comment_count)} comments</span>
          {newComments && newComments > 0 ? (
            <span className="new-badge" data-tauri-drag-region>
              {compact(newComments)} new since you last looked
            </span>
          ) : null}
          <span data-tauri-drag-region>{timeAgo(Date.parse(thread.created_at) / 1000)}</span>
          <button type="button" className="link" onClick={() => openExternal(hnLink(thread.id))}>
            Discussion ↗
          </button>
        </div>

        <nav className="tabs" data-tauri-drag-region>
          {TABS.map((entry) => {
            const output = outputs[entry.key as "digest" | "rundown"];
            const ready = Boolean(output?.text) && !output?.streaming;
            const working = Boolean(output?.streaming);
            return (
              <button
                key={entry.key}
                type="button"
                className={tab === entry.key ? "active" : ""}
                title={entry.hint}
                onClick={() => setTab(entry.key)}
              >
                {entry.label}
                {working ? <span className="tab-dot working" /> : null}
                {ready ? <span className="tab-dot" /> : null}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="reader-scroll" ref={scrollRef}>
        {tab === "rundown" ? <RundownView /> : null}
        {tab === "article" ? <ArticleView /> : null}
        {tab === "comments" ? <CommentsView /> : null}
        {tab === "digest" ? (
          <OutputView
            kind="digest"
            emptyTitle="Digest this thread"
            emptyBody="Themed takes with the sharpest quotes, who said them, and a link back to each comment. Disagreements are kept as disagreements."
            actionLabel="Read the thread for me"
          />
        ) : null}

      </div>
    </main>
  );
}
