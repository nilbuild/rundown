import { useEffect, useRef } from "react";
import { useApp } from "~/stores/app";
import { ArticleView } from "~/components/article/article-view";
import { CommentsView } from "~/components/comments/comments-view";
import { OutputView } from "~/components/digest/output-view";
import { RundownView } from "~/components/rundown/rundown-view";
import { openExternal } from "~/lib/api/shell";
import { CommentsSkeleton } from "~/components/ui/comments-skeleton";
import { cn } from "~/utils/classname";
import { ErrorState } from "~/components/ui/error-state";
import { compact, hnLink, timeAgo } from "~/utils/format";
import type { Tab } from "~/stores/app";
import { LinkButton } from "~/components/ui/link-button";

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "rundown", label: "Briefing", hint: "The whole story in plain words" },
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
    <div className="flex items-center gap-2.5 border-b border-line bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] px-8 py-2 text-[12.5px] text-bad [&_button]:ml-auto [&_button]:text-inherit [&_button]:underline">
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
      <main className="flex min-h-0 min-w-0 flex-col bg-panel">
        {notice}
        <header className="border-b border-line-soft px-8 pt-9 pb-[26px]" data-tauri-drag-region>
          <div className="skeleton" style={{ width: "52%", height: 17 }} data-tauri-drag-region />
          <div
            className="skeleton"
            style={{ width: "30%", height: 11, marginTop: 10 }}
            data-tauri-drag-region
          />
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[860px] px-8 pt-2 pb-[120px]">
            <CommentsSkeleton />
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-0 min-w-0 flex-col bg-panel">
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
      <main className="flex min-h-0 min-w-0 flex-col bg-panel">
        {notice}
        <div className="mx-auto max-w-[420px] px-8 py-[90px] text-center text-balance [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_p]:mb-5 [&_p]:text-[13.5px] [&_p]:leading-[1.6] [&_p]:text-muted pt-[140px]">
          <h2>Pick a story</h2>
          <p>
            Read it, or have it read for you. Every quote is checked against the comment it
            came from.
          </p>
          <p className="text-xs leading-[1.5] text-muted">⌘K for the command palette · j and k move through the list</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-0 min-w-0 flex-col bg-panel">
      {notice}
      <header className="border-b border-line-soft px-8 pt-9" data-tauri-drag-region>
        {/* The title is the window's drag handle, as it would be on any Mac
            window. Opening the discussion moved to an explicit control below. */}
        <h1
          className="mb-2.5 cursor-default text-[17px] leading-[1.35] font-semibold tracking-[-0.012em]"
          data-tauri-drag-region
        >
          {thread.title}
        </h1>

        <div
          className="mb-4 flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-muted"
          data-tauri-drag-region
        >
          {thread.domain ? (
            <LinkButton
             
             
              onClick={() => thread.url && openExternal(thread.url)}
            >
              {thread.domain} ↗
            </LinkButton>
          ) : null}
          {thread.points !== null ? (
            <span data-tauri-drag-region>{compact(thread.points)} points</span>
          ) : null}
          {thread.author ? <span data-tauri-drag-region>by {thread.author}</span> : null}
          <span data-tauri-drag-region>{compact(thread.comment_count)} comments</span>
          {newComments && newComments > 0 ? (
            <span className="font-[550] text-accent" data-tauri-drag-region>
              {compact(newComments)} new since you last looked
            </span>
          ) : null}
          <span data-tauri-drag-region>{timeAgo(Date.parse(thread.created_at) / 1000)}</span>
          <LinkButton onClick={() => openExternal(hnLink(thread.id))}>
            Discussion ↗
          </LinkButton>
        </div>

        <nav className="flex gap-1" data-tauri-drag-region>
          {TABS.map((entry) => {
            const output = outputs[entry.key as "digest" | "rundown"];
            const ready = Boolean(output?.text) && !output?.streaming;
            const working = Boolean(output?.streaming);
            return (
              <button
                key={entry.key}
                type="button"
                className={cn(
                  "relative -mb-px border-b-2 border-transparent px-3 pt-2 pb-2.5 text-[12.5px] text-muted not-disabled:hover:text-fg disabled:cursor-default disabled:opacity-35",
                  tab === entry.key && "border-b-accent text-fg",
                )}
                title={entry.hint}
                onClick={() => setTab(entry.key)}
              >
                {entry.label}
                {working ? <span className="ml-[5px] inline-block size-1 rounded-full bg-accent align-middle animate-pulse-dot" /> : null}
                {ready ? <span className="ml-[5px] inline-block size-1 rounded-full bg-accent align-middle" /> : null}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {tab === "rundown" ? <RundownView /> : null}
        {tab === "article" ? <ArticleView /> : null}
        {tab === "comments" ? <CommentsView /> : null}
        {tab === "digest" ? (
          <OutputView
            kind="digest"
            emptyTitle="Digest this thread"
            emptyBody="The sharpest quotes, who said them, and a link back. Disagreements stay disagreements."
            actionLabel="Read the thread for me"
          />
        ) : null}

      </div>
    </main>
  );
}
