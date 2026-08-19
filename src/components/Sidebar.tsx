import { useEffect, useRef, useState } from "react";
import { useApp } from "../state/app";
import { compact, timeAgo } from "../lib/format";
import { StoryListSkeleton } from "./Skeleton";
import { Tooltip } from "./ui/Tooltip";
import { InlineError } from "./ErrorState";
import type { FeedName } from "../lib/types";
import { RotateCw, X } from "lucide-react";

const FEEDS: { key: FeedName; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "best", label: "Best" },
  { key: "new", label: "New" },
  { key: "ask", label: "Ask" },
  { key: "show", label: "Show" },
  { key: "jobs", label: "Jobs" },
];

export function Sidebar() {
  const feed = useApp((state) => state.feed);
  const stories = useApp((state) => state.stories);
  const loading = useApp((state) => state.loadingFeed);
  const error = useApp((state) => state.feedError);
  const selectedId = useApp((state) => state.selectedId);
  const readIds = useApp((state) => state.readIds);
  const searching = useApp((state) => state.searching);
  const searchQuery = useApp((state) => state.searchQuery);
  const loadingMore = useApp((state) => state.loadingMore);
  const refreshing = useApp((state) => state.refreshing);
  const hasMore = useApp((state) => state.hasMore);

  const setFeed = useApp((state) => state.setFeed);
  const selectStory = useApp((state) => state.selectStory);
  const refreshFeed = useApp((state) => state.refreshFeed);
  const runSearch = useApp((state) => state.runSearch);
  const clearSearch = useApp((state) => state.clearSearch);
  const loadMore = useApp((state) => state.loadMore);

  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [feed, searching]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) {
          return;
        }
        loadMore();
      },
      { root: listRef.current, rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, stories.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "j" && event.key !== "k") {
        return;
      }

      const index = stories.findIndex((story) => story.id === selectedId);
      const next = event.key === "j" ? index + 1 : index - 1;
      if (next < 0 || next >= stories.length) {
        return;
      }
      event.preventDefault();
      selectStory(stories[next].id);
      document
        .querySelector(`[data-story-id="${stories[next].id}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stories, selectedId, selectStory]);

  return (
    <aside className="sidebar">
      {/* Nothing but clearance for the traffic lights, and somewhere to grab
          the window. The app's name is already in the menu bar. */}
      <div className="sidebar-top" data-tauri-drag-region />

      <form
        className="search"
        onSubmit={(event) => {
          event.preventDefault();
          runSearch(draft);
        }}
      >
        <input
          type="search"
          value={draft}
          placeholder="Search Hacker News"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          name="hn-search"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft("");
              clearSearch();
            }
          }}
        />
        {draft ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              clearSearch();
            }}
          >
<X size={11} strokeWidth={2.2} />
          </button>
        ) : null}
      </form>

      <nav className="feeds">
        {FEEDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={!searching && feed === entry.key ? "active" : ""}
            onClick={() => setFeed(entry.key)}
          >
            {entry.label}
          </button>
        ))}
        <Tooltip label={refreshing ? "Refreshing…" : "Refresh this feed"}>
          <button
            type="button"
            className="feed-refresh"
            aria-label="Refresh"
            disabled={refreshing}
            onClick={() => (searching ? runSearch(searchQuery) : refreshFeed(true))}
          >
<RotateCw size={13} strokeWidth={2} className={refreshing ? "spinning" : ""} />
          </button>
        </Tooltip>
      </nav>

      <div className="story-list" ref={listRef}>
        {loading && stories.length === 0 ? <StoryListSkeleton /> : null}
        {error ? (
          <InlineError
            message={error}
            onRetry={() => (searching ? runSearch(searchQuery) : refreshFeed())}
          />
        ) : null}
        {!loading && !error && stories.length === 0 ? (
          <div className="hint pad">
            {searching ? `Nothing matched “${searchQuery}”.` : "Nothing here."}
          </div>
        ) : null}

        {stories.map((story, index) => (
          <button
            key={story.id}
            type="button"
            data-story-id={story.id}
            className={`story ${story.id === selectedId ? "selected" : ""} ${
              readIds.has(story.id) ? "read" : ""
            }`}
            onClick={() => selectStory(story.id)}
          >
            <div className="story-rank">{searching ? "" : index + 1}</div>
            <div className="story-body">
              <div className="story-title">{story.title}</div>
              <div className="story-meta">
                {story.domain ? <span className="domain">{story.domain}</span> : null}
                <span>{compact(story.score)} pts</span>
                <span>{compact(story.descendants)} comments</span>
                <span>{timeAgo(story.time)}</span>
              </div>
            </div>
          </button>
        ))}

        {stories.length > 0 && !searching ? (
          <div className="sentinel" ref={sentinelRef}>
            {loadingMore ? "Loading more…" : hasMore ? "" : "End of feed"}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
