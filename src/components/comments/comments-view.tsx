import { memo, useEffect, useRef, useState } from "react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { hnLink, isoAgo } from "~/utils/format";
import { openExternal } from "~/lib/api";
import type { Comment } from "~/types";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { GhostButton, IconButton } from "~/components/ui/button";
import { cn } from "~/utils/classname";

interface RowProps {
  comment: Comment;
}

// Each row subscribes to only its own collapse and jump state, so toggling one
// comment in an 800-comment thread does not re-render the rest.
const Row = memo(function Row(props: RowProps) {
  const { comment } = props;
  const isCollapsed = useApp((state) => state.collapsed.has(comment.id));
  const isTarget = useApp((state) => state.jumpTarget === comment.id);
  const isMatch = useApp((state) => state.matchIds.includes(comment.id));
  const isNew = useApp((state) => {
    if (state.lastVisit === null) {
      return false;
    }
    const posted = Date.parse(comment.created_at);
    return !Number.isNaN(posted) && posted / 1000 > state.lastVisit;
  });
  const seen = useApp((state) => state.seenNew.has(comment.id));
  const markNewSeen = useApp((state) => state.markNewSeen);
  const cardRef = useRef<HTMLDivElement>(null);

  // A "new" marker that never retires is just noise, so it clears once the
  // comment has actually sat on screen for a moment.
  useEffect(() => {
    if (!isNew || seen) {
      return;
    }
    const node = cardRef.current;
    if (!node) {
      return;
    }
    let timer: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          timer = window.setTimeout(() => markNewSeen(comment.id), 1200);
          return;
        }
        window.clearTimeout(timer);
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [isNew, seen, comment.id, markNewSeen]);
  const toggleCollapse = useApp((state) => state.toggleCollapse);
  const setSelection = useApp((state) => state.setSelection);
  const setChatOpen = useApp((state) => state.setChatOpen);

  // The line descends from the control that folds this subtree: it starts just
  // under the control and runs to the bottom of the last reply, centred on it
  // (the card's 10px padding plus half a 16px button). Only a comment that
  // actually has replies draws one.
  return (
    <div className="group/comment relative before:absolute before:top-[26px] before:bottom-0 before:left-[18px] before:w-px before:bg-line before:content-[''] not-has-[>[data-replies]]:before:hidden">
      <div
        ref={cardRef}
        id={`comment-${comment.id}`}
        className={cn(
          "group/card rounded-lg px-2.5 pt-2 pb-1.5 transition-[background] duration-500 hover:bg-line-soft",
          isMatch && "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]",
          // Unread comments get a wash that fades once they have been on
          // screen. No accent bar.
          isNew && !seen && "bg-[color-mix(in_srgb,var(--good)_7%,transparent)]",
          isTarget && "bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]",
        )}
        data-selection-source="comment"
        data-comment-id={comment.id}
        data-author={comment.author ?? ""}
      >
        <div className="mb-[3px] flex items-center gap-1.5 text-[11.5px] leading-4 text-muted">
          <button
            type="button"
            className="inline-flex size-4 shrink-0 items-center justify-center rounded border border-line pb-px text-xs leading-none font-medium text-muted tabular-nums hover:bg-line hover:text-fg"
            onClick={() => toggleCollapse(comment.id)}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? "+" : "–"}
          </button>
          <span className="font-[550] text-fg-soft">{comment.author ?? "unknown"}</span>
          <span className="opacity-50">·</span>
          <span className="text-muted">{isoAgo(comment.created_at)}</span>
          {isNew && !seen ? <span className="size-[5px] shrink-0 rounded-full bg-good" title="Posted since your last visit" /> : null}
          {isCollapsed && comment.subtree_size > 1 ? (
            <span className="text-[11px] text-accent">{comment.subtree_size} hidden</span>
          ) : null}

          <div className="ml-auto flex gap-0.5 opacity-0 transition-opacity duration-[120ms] group-hover/card:opacity-100 [&_button]:rounded-md [&_button]:border [&_button]:border-line [&_button]:bg-panel [&_button]:px-2 [&_button]:py-0.5 [&_button]:text-[11px] [&_button]:text-muted [&_button:hover]:bg-line [&_button:hover]:text-fg">
            <button
              type="button"
              onClick={() => {
                setSelection({
                  text: comment.text,
                  source: "comment",
                  commentId: comment.id,
                  author: comment.author ?? undefined,
                });
                setChatOpen(true);
              }}
            >
              Ask
            </button>
            <button
              type="button"
              title="Open on Hacker News"
              onClick={() => openExternal(hnLink(comment.id))}
            >
              ↗
            </button>
          </div>
        </div>

        {isCollapsed ? null : <Markdown source={comment.text} className="pl-[22px] text-[13.5px] leading-[1.62] text-fg-soft [&_p]:mb-[0.7em] [&_blockquote]:mb-[0.7em] [&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:py-px [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_blockquote_p:last-child]:mb-0" />}
      </div>

      {isCollapsed || comment.children.length === 0 ? null : (
        <div data-replies className="pl-[30px]">
          {comment.children.map((child) => (
            <Row key={child.id} comment={child} />
          ))}
        </div>
      )}
    </div>
  );
});

export function CommentsView() {
  const thread = useApp((state) => state.thread);
  const jumpTarget = useApp((state) => state.jumpTarget);
  const clearJump = useApp((state) => state.clearJump);
  const collapseAll = useApp((state) => state.collapseAll);
  const expandAll = useApp((state) => state.expandAll);
  const commentQuery = useApp((state) => state.commentQuery);
  const matchIds = useApp((state) => state.matchIds);
  const matchIndex = useApp((state) => state.matchIndex);
  const setCommentQuery = useApp((state) => state.setCommentQuery);
  const stepMatch = useApp((state) => state.stepMatch);
  const stepTopLevel = useApp((state) => state.stepTopLevel);
  const newComments = useApp((state) => state.newComments);
  const stepNew = useApp((state) => state.stepNew);
  const newIds = useApp((state) => state.newIds);
  const seenNew = useApp((state) => state.seenNew);
  const markAllNewSeen = useApp((state) => state.markAllNewSeen);
  const unseenNew = newIds.filter((id) => !seenNew.has(id)).length;

  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!jumpTarget) {
      return;
    }
    const node = document.getElementById(`comment-${jumpTarget}`);
    if (!node) {
      return;
    }
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    // A search hit stays highlighted; a one-off jump fades.
    if (matchIds.includes(jumpTarget)) {
      return;
    }
    const timer = window.setTimeout(() => clearJump(), 2600);
    return () => window.clearTimeout(timer);
  }, [jumpTarget, clearJump, matchIds]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA"].includes(target.tagName);

      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.select(), 0);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === "n") {
        event.preventDefault();
        stepTopLevel(1);
        return;
      }
      if (event.key === "p") {
        event.preventDefault();
        stepTopLevel(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepTopLevel]);

  if (!thread) {
    return null;
  }

  if (thread.comments.length === 0) {
    return (
      <div className="mx-auto max-w-[440px] px-8 py-[90px] text-center [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_p]:mb-5 [&_p]:text-[13.5px] [&_p]:leading-[1.6] [&_p]:text-muted">
        <h2>No comments yet</h2>
        <p>Nobody has replied to this submission.</p>
      </div>
    );
  }

  const closeSearch = () => {
    setSearchOpen(false);
    setCommentQuery("");
  };

  return (
    <div className="max-w-[860px] px-8 pt-2 pb-[120px]">
      <div className="sticky top-0 z-2 mb-1 flex items-center gap-2 bg-panel pt-2.5 pb-3">
        {searchOpen ? (
          <div className="flex w-full items-center gap-1.5 [&_input]:h-7 [&_input]:flex-1 [&_input]:rounded-[7px] [&_input]:border [&_input]:border-accent [&_input]:bg-panel-2 [&_input]:px-2.5 [&_input]:text-[12.5px] [&_input]:outline-none [&_.text-muted]:min-w-[62px] [&_.text-muted]:text-right [&_.text-muted]:text-[11.5px] [&_.text-muted]:tabular-nums [&_.text-muted]:whitespace-nowrap">
            <input
              ref={searchRef}
              type="search"
              value={commentQuery}
              placeholder="Find in thread"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              onChange={(event) => setCommentQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeSearch();
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  stepMatch(event.shiftKey ? -1 : 1);
                }
              }}
            />
            <span className="text-muted">
              {commentQuery.trim().length < 2
                ? ""
                : matchIds.length === 0
                  ? "no matches"
                  : `${matchIndex + 1} of ${matchIds.length}`}
            </span>
            <IconButton
             
             
              title="Previous match (⇧enter)"
              onClick={() => stepMatch(-1)}
            >
              <ArrowUp size={13} strokeWidth={2} />
            </IconButton>
            <IconButton
             
             
              title="Next match (enter)"
              onClick={() => stepMatch(1)}
            >
              <ArrowDown size={13} strokeWidth={2} />
            </IconButton>
            <IconButton title="Close find" onClick={closeSearch}>
              <X size={13} strokeWidth={2.2} />
            </IconButton>
          </div>
        ) : (
          <>
            <span className="text-muted">{thread.comment_count} comments</span>
            {unseenNew > 0 ? (
              <span className="group/fresh inline-flex items-center gap-px rounded-[20px] bg-[color-mix(in_srgb,var(--good)_14%,transparent)] pr-[3px]">
                <button
                  type="button"
                  className="rounded-l-[20px] py-0.5 pr-1 pl-2.5 text-[11.5px] font-[550] text-good"
                  onClick={() => stepNew(1)}
                >
                  {unseenNew} new
                </button>
                <button
                  type="button"
                  className="inline-flex size-[17px] items-center justify-center rounded-full text-good opacity-65 group-hover/fresh:bg-[color-mix(in_srgb,var(--good)_20%,transparent)] group-hover/fresh:opacity-100"
                  aria-label="Mark all as read"
                  onClick={() => markAllNewSeen()}
                >
<X size={10} strokeWidth={2.4} />
                </button>
              </span>
            ) : newComments === 0 || newIds.length > 0 ? (
              <span className="text-muted">nothing new</span>
            ) : null}
            <div className="flex-1" />
            <GhostButton
             
             
              title="Find in thread (⌘F)"
              onClick={() => setSearchOpen(true)}
            >
              Find
            </GhostButton>
            <GhostButton onClick={() => collapseAll()}>
              Collapse all
            </GhostButton>
            <GhostButton onClick={() => expandAll()}>
              Expand all
            </GhostButton>
          </>
        )}
      </div>

      {thread.comments.map((comment) => (
        <Row key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
