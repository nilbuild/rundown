import "./comments-view.css";

import { memo, useEffect, useRef, useState } from "react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { hnLink, isoAgo } from "~/utils/format";
import { openExternal } from "~/lib/api";
import type { Comment } from "~/types";
import { ArrowDown, ArrowUp, X } from "lucide-react";

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

  return (
    <div className={`comment depth-${Math.min(comment.depth, 8)}`}>
      <div
        ref={cardRef}
        id={`comment-${comment.id}`}
        className={`comment-card ${isTarget ? "targeted" : ""} ${isMatch ? "matched" : ""} ${
          isNew && !seen ? "fresh" : ""
        }`}
        data-selection-source="comment"
        data-comment-id={comment.id}
        data-author={comment.author ?? ""}
      >
        <div className="comment-head">
          <button
            type="button"
            className="collapse"
            onClick={() => toggleCollapse(comment.id)}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? "+" : "–"}
          </button>
          <span className="author">{comment.author ?? "unknown"}</span>
          <span className="dot">·</span>
          <span className="muted">{isoAgo(comment.created_at)}</span>
          {isNew && !seen ? <span className="fresh-dot" title="Posted since your last visit" /> : null}
          {isCollapsed && comment.subtree_size > 1 ? (
            <span className="subtree">{comment.subtree_size} hidden</span>
          ) : null}

          <div className="comment-actions">
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

        {isCollapsed ? null : <Markdown source={comment.text} className="comment-body" />}
      </div>

      {isCollapsed
        ? null
        : comment.children.map((child) => <Row key={child.id} comment={child} />)}
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
      <div className="empty-state">
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
    <div className="comments">
      <div className="comments-toolbar">
        {searchOpen ? (
          <div className="thread-search">
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
            <span className="muted">
              {commentQuery.trim().length < 2
                ? ""
                : matchIds.length === 0
                  ? "no matches"
                  : `${matchIndex + 1} of ${matchIds.length}`}
            </span>
            <button
              type="button"
              className="icon-button"
              title="Previous match (⇧enter)"
              onClick={() => stepMatch(-1)}
            >
              <ArrowUp size={13} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Next match (enter)"
              onClick={() => stepMatch(1)}
            >
              <ArrowDown size={13} strokeWidth={2} />
            </button>
            <button type="button" className="icon-button" title="Close find" onClick={closeSearch}>
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
        ) : (
          <>
            <span className="muted">{thread.comment_count} comments</span>
            {unseenNew > 0 ? (
              <span className="fresh-group">
                <button
                  type="button"
                  className="fresh-jump"
                  onClick={() => stepNew(1)}
                >
                  {unseenNew} new
                </button>
                <button
                  type="button"
                  className="fresh-dismiss"
                  aria-label="Mark all as read"
                  onClick={() => markAllNewSeen()}
                >
<X size={10} strokeWidth={2.4} />
                </button>
              </span>
            ) : newComments === 0 || newIds.length > 0 ? (
              <span className="muted">nothing new</span>
            ) : null}
            <div className="spacer" />
            <button
              type="button"
              className="ghost-button"
              title="Find in thread (⌘F)"
              onClick={() => setSearchOpen(true)}
            >
              Find
            </button>
            <button type="button" className="ghost-button" onClick={() => collapseAll()}>
              Collapse all
            </button>
            <button type="button" className="ghost-button" onClick={() => expandAll()}>
              Expand all
            </button>
          </>
        )}
      </div>

      {thread.comments.map((comment) => (
        <Row key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
