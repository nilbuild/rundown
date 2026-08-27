import { useEffect, useRef, useState } from "react";
import { useApp } from "~/stores/app";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { GhostButton } from "~/components/ui/ghost-button";
import { IconButton } from "~/components/ui/icon-button";
import { CommentRow } from "~/components/comments/comment-row";
import { useJumpToComment } from "~/hooks/use-jump-to-comment";

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

  useJumpToComment(jumpTarget, matchIds, clearJump);

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
        <CommentRow key={comment.id} comment={comment} />
      ))}
    </div>
  );
}
