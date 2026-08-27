import { useEffect, useRef, useState } from "react";
import { useApp } from "~/stores/app";
import { compact, timeAgo } from "~/utils/format";
import { StoryListSkeleton } from "~/components/ui/story-list-skeleton";
import { Tooltip } from "~/components/ui/tooltip";
import { InlineError } from "~/components/ui/inline-error";
import { parseItemRef } from "~/utils/hn-link";
import type { FeedName } from "~/lib/api/reading";
import { RotateCw, X } from "lucide-react";
import { cn } from "~/utils/classname";
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll";
import { useStoryKeys } from "~/hooks/use-story-keys";

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
  const openItemRef = useApp((state) => state.openItemRef);
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

  useInfiniteScroll(sentinelRef, listRef, loadMore, [loadMore, stories.length]);

  useStoryKeys(stories, selectedId, selectStory);

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-panel-2">
      {/* Nothing but clearance for the traffic lights, and somewhere to grab
          the window. The app's name is already in the menu bar. */}
      <div className="h-9" data-tauri-drag-region />

      <form
        className="relative px-3 pt-0.5 pb-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          // A pasted thread link is an instruction to open it, not a search for
          // its digits.
          const item = parseItemRef(draft);
          if (item !== null) {
            setDraft("");
            openItemRef(item);
            return;
          }
          runSearch(draft);
        }}
      >
        <input
          className="w-full rounded-[7px] border border-line bg-panel py-1.5 pr-[30px] pl-2.5 text-[12.5px] outline-none focus:border-accent"
          type="search"
          value={draft}
          placeholder="Search, or paste a thread link"
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
            className="absolute top-1.5 right-[18px] inline-flex size-[18px] items-center justify-center rounded-full text-muted transition-[background,color] duration-[120ms] hover:bg-line hover:text-fg"
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

      <nav className="flex items-center gap-0.5 border-b border-line px-3 pb-2">
        {FEEDS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={cn(
              "rounded-md px-2 py-[3px] text-xs text-muted hover:bg-line-soft hover:text-fg",
              !searching && feed === entry.key && "bg-accent-soft text-accent",
            )}
            onClick={() => setFeed(entry.key)}
          >
            {entry.label}
          </button>
        ))}
        <Tooltip label={refreshing ? "Refreshing…" : "Refresh this feed"}>
          <button
            type="button"
            className="ml-auto inline-flex h-6 w-[26px] items-center justify-center rounded-md text-muted not-disabled:hover:bg-line-soft not-disabled:hover:text-fg disabled:cursor-default disabled:text-accent"
            aria-label="Refresh"
            disabled={refreshing}
            onClick={() => (searching ? runSearch(searchQuery) : refreshFeed(true))}
          >
<RotateCw size={13} strokeWidth={2} className={cn(refreshing && "animate-spin-slow motion-reduce:animate-none motion-reduce:opacity-50")} />
          </button>
        </Tooltip>
      </nav>

      <div className="flex-1 overflow-y-auto pt-1.5 pb-6" ref={listRef}>
        {loading && stories.length === 0 ? <StoryListSkeleton /> : null}
        {error ? (
          <InlineError
            className="mx-3"
            message={error}
            onRetry={() => (searching ? runSearch(searchQuery) : refreshFeed())}
          />
        ) : null}
        {!loading && !error && stories.length === 0 ? (
          <div className="px-8 py-7 text-[13px] text-muted">
            {searching ? `Nothing matched “${searchQuery}”.` : "Nothing here."}
          </div>
        ) : null}

        {stories.map((story, index) => (
          <button
            key={story.id}
            type="button"
            data-story-id={story.id}
            className={cn(
              "flex w-full gap-2.5 border-l-2 border-transparent py-[9px] pr-3.5 pl-2.5 text-left hover:bg-line-soft",
              story.id === selectedId && "border-l-accent bg-accent-soft",
            )}
            onClick={() => selectStory(story.id)}
          >
            <div className="w-[18px] pt-px text-right text-[11px] text-muted tabular-nums">{searching ? "" : index + 1}</div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "mb-[3px] text-[13px] leading-[1.4] font-medium",
                  readIds.has(story.id) && story.id !== selectedId && "text-muted",
                )}
              >
                {story.title}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted tabular-nums">
                {story.domain ? <span className="max-w-[150px] truncate text-accent opacity-85">{story.domain}</span> : null}
                <span>{compact(story.score)} pts</span>
                <span>{compact(story.descendants)} comments</span>
                <span>{timeAgo(story.time)}</span>
              </div>
            </div>
          </button>
        ))}

        {stories.length > 0 && !searching ? (
          <div className="pt-[18px] pb-1.5 text-center text-[11.5px] text-muted" ref={sentinelRef}>
            {loadingMore ? "Loading more…" : hasMore ? "" : "End of feed"}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
