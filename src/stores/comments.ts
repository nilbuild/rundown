import type { StateCreator } from "zustand";
import type { AppState } from "./types";
import type { Thread } from "~/lib/api/reading";

export interface CommentsSlice {
  commentQuery: string;
  matchIds: number[];
  matchIndex: number;
  newIds: number[];
  newIndex: number;
  /// New comments the reader has actually had on screen, so the marker can
  /// retire itself instead of shouting "new" at already-read text.
  seenNew: Set<number>;
  setCommentQuery: (query: string) => void;
  stepMatch: (direction: 1 | -1) => void;
  stepTopLevel: (direction: 1 | -1) => void;
  stepNew: (direction: 1 | -1) => void;
  markNewSeen: (id: number) => void;
  markAllNewSeen: () => void;
}

export const createCommentsSlice: StateCreator<AppState, [], [], CommentsSlice> = (
  set,
  get,
) => ({
  commentQuery: "",
  matchIds: [],
  matchIndex: 0,
  newIds: [],
  newIndex: 0,
  seenNew: new Set(),

  setCommentQuery: (query) => {
    const thread = get().thread;
    const needle = query.trim().toLowerCase();
    if (!thread || needle.length < 2) {
      set({ commentQuery: query, matchIds: [], matchIndex: 0 });
      return;
    }

    const matchIds: number[] = [];
    const walk = (nodes: Thread["comments"]) => {
      for (const node of nodes) {
        const author = node.author?.toLowerCase() ?? "";
        if (node.text.toLowerCase().includes(needle) || author.includes(needle)) {
          matchIds.push(node.id);
        }
        walk(node.children);
      }
    };
    walk(thread.comments);

    // A match inside a collapsed subtree is unreachable, so open everything.
    set({
      commentQuery: query,
      matchIds,
      matchIndex: 0,
      collapsed: matchIds.length > 0 ? new Set() : get().collapsed,
      jumpTarget: matchIds[0] ?? null,
    });
  },
  stepMatch: (direction) => {
    const { matchIds, matchIndex } = get();
    if (matchIds.length === 0) {
      return;
    }
    const next = (matchIndex + direction + matchIds.length) % matchIds.length;
    set({ matchIndex: next, jumpTarget: matchIds[next] });
  },
  stepTopLevel: (direction) => {
    const thread = get().thread;
    if (!thread || thread.comments.length === 0) {
      return;
    }
    const ids = thread.comments.map((comment) => comment.id);
    const current = get().jumpTarget;
    const at = current === null ? -1 : ids.indexOf(current);
    const next = at === -1 ? (direction > 0 ? 0 : ids.length - 1) : at + direction;
    if (next < 0 || next >= ids.length) {
      return;
    }
    set({ tab: "comments", jumpTarget: ids[next] });
  },
  stepNew: (direction) => {
    const { newIds, newIndex } = get();
    if (newIds.length === 0) {
      return;
    }
    const next = (newIndex + direction + newIds.length) % newIds.length;
    set({ tab: "comments", newIndex: next, jumpTarget: newIds[next], collapsed: new Set() });
  },
  markNewSeen: (id) => {
    const seenNew = get().seenNew;
    if (seenNew.has(id)) {
      return;
    }
    const next = new Set(seenNew);
    next.add(id);
    set({ seenNew: next });
  },
  markAllNewSeen: () => set({ seenNew: new Set(get().newIds) }),
});

/// Ids of comments posted after `since`, depth-first so stepping through them
/// follows reading order rather than post order.
export function freshIds(thread: Thread, since: number | null) {
  if (since === null) {
    return [];
  }
  const ids: number[] = [];
  const walk = (nodes: Thread["comments"]) => {
    for (const node of nodes) {
      const posted = Date.parse(node.created_at);
      if (!Number.isNaN(posted) && posted / 1000 > since) {
        ids.push(node.id);
      }
      walk(node.children);
    }
  };
  walk(thread.comments);
  return ids;
}
