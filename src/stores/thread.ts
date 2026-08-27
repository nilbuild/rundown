import type { StateCreator } from "zustand";
import * as outputsApi from "~/lib/api/outputs";
import * as readingApi from "~/lib/api/reading";
import type { AppState } from "./types";
import type { Article, Coverage, Thread } from "~/lib/api/reading";
import type { OutputKind } from "~/lib/api/outputs";
import type { Tab } from "./types";
import { cancelPrefetch } from "./prefetch";
import { emptyOutput } from "./outputs";
import { freshIds } from "./comments";
import * as chatApi from "~/lib/api/chat";

export interface ThreadSlice {
  tab: Tab;
  selectedId: number | null;
  thread: Thread | null;
  article: Article | null;
  articleLoading: boolean;
  loadingThread: boolean;
  threadError: string | null;
  coverage: Coverage | null;
  collapsed: Set<number>;
  articleError: string | null;
  newComments: number | null;
  lastVisit: number | null;
  jumpTarget: number | null;
  selectStory: (id: number) => Promise<void>;
  reloadStory: () => Promise<void>;
  openItemRef: (id: number) => Promise<void>;
  setTab: (tab: Tab) => void;
  toggleCollapse: (id: number) => void;
  collapseAll: () => void;
  expandAll: () => void;
  jumpToComment: (id: number) => void;
  clearJump: () => void;
  retryArticle: () => Promise<void>;
}

export const createThreadSlice: StateCreator<AppState, [], [], ThreadSlice> = (
  set,
  get,
) => ({
  selectedId: null,
  thread: null,
  article: null,
  articleLoading: false,
  loadingThread: false,
  threadError: null,
  coverage: null,
  collapsed: new Set(),
  articleError: null,
  newComments: null,
  lastVisit: null,
  tab: "rundown",
  jumpTarget: null,

  selectStory: async (id) => {
    set({ view: "reader" });
    if (get().selectedId === id) {
      return;
    }

    const readIds = new Set(get().readIds);
    readIds.add(id);

    // Abandon any work for the story being left behind — all of it, not just
    // the speculative rundown.
    cancelPrefetch();
    const leaving = get();
    for (const output of Object.values(leaving.outputs)) {
      if (output.streaming && output.runId) {
        outputsApi.cancelRun(output.runId).catch(() => undefined);
      }
    }
    if (leaving.chatBusy && leaving.chatRunId) {
      outputsApi.cancelRun(leaving.chatRunId).catch(() => undefined);
    }

    set({
      selectedId: id,
      thread: null,
      article: null,
      coverage: null,
      loadingThread: true,
      threadError: null,
      articleLoading: false,
      articleError: null,
      newComments: null,
      lastVisit: null,
      collapsed: new Set(),
      readIds,
      tab: "rundown",
      outputs: { rundown: emptyOutput(), digest: emptyOutput(), brief: emptyOutput() },
      chatMessages: [],
      chatStreaming: "",
      chatError: null,
      selection: null,
      prefetching: false,
      prefetchPending: false,
      commentQuery: "",
      matchIds: [],
      matchIndex: 0,
      newIds: [],
      newIndex: 0,
      seenNew: new Set(),
    });

    try {
      const view = await readingApi.loadThread(id);
      if (get().selectedId !== id) {
        return;
      }
      const thread = view.thread;
      set({
        thread,
        loadingThread: false,
        newComments: view.newComments,
        lastVisit: view.lastVisit,
        newIds: freshIds(thread, view.lastVisit),
      });

      chatApi
        .chatHistory(`story:${id}`)
        .then((messages) => {
          if (get().selectedId !== id) {
            return;
          }
          set({ chatMessages: messages });
        })
        .catch(() => undefined);

      readingApi
        .coverage(id)
        .then((coverage) => {
          if (get().selectedId !== id) {
            return;
          }
          set({ coverage });
        })
        .catch(() => undefined);

      for (const kind of ["rundown", "digest", "brief"] as OutputKind[]) {
        outputsApi
          .cachedOutput(id, kind)
          .then((cached) => {
            if (!cached || get().selectedId !== id) {
              return;
            }
            set((state) => ({
              outputs: {
                ...state.outputs,
                [kind]: {
                  ...emptyOutput(),
                  text: cached.markdown,
                  report: cached.report,
                  fromCache: true,
                },
              },
            }));
          })
          .catch(() => undefined);
      }

      if (thread.url) {
        set({ articleLoading: true });
        readingApi
          .loadArticle(thread.url)
          .then((article) => {
            if (get().selectedId !== id) {
              return;
            }
            set({ article, articleLoading: false, articleError: null });
          })
          .catch((err) => {
            if (get().selectedId !== id) {
              return;
            }
            set({ articleLoading: false, articleError: String(err) });
          });
      }

      get().schedulePrefetch(id);
    } catch (err) {
      if (get().selectedId !== id) {
        return;
      }
      set({ loadingThread: false, threadError: String(err) });
    }
  },
  /// A pasted link can point at a comment as easily as a story, so the id is
  /// resolved to the story holding it and the reader lands on the comment.
  openItemRef: async (id) => {
    set({ loadingThread: true, threadError: null });
    try {
      const ref = await readingApi.resolveItem(id);
      await get().selectStory(ref.storyId);
      if (ref.commentId !== null) {
        get().jumpToComment(ref.commentId);
      }
    } catch (err) {
      set({ loadingThread: false, threadError: String(err) });
    }
  },

  reloadStory: async () => {
    const id = get().selectedId;
    if (!id) {
      return;
    }
    set({ loadingThread: true, threadError: null });
    try {
      const view = await readingApi.loadThread(id, true);
      set({
        thread: view.thread,
        loadingThread: false,
        newComments: view.newComments,
        lastVisit: view.lastVisit,
        newIds: freshIds(view.thread, view.lastVisit),
      });
      if (view.thread.url) {
        set({ articleLoading: true, articleError: null });
        try {
          const article = await readingApi.loadArticle(view.thread.url, true);
          set({ article, articleLoading: false });
        } catch (err) {
          set({ articleLoading: false, articleError: String(err) });
        }
      }
    } catch (err) {
      set({ loadingThread: false, threadError: String(err) });
    }
  },
  retryArticle: async () => {
    const thread = get().thread;
    if (!thread?.url) {
      return;
    }
    set({ articleLoading: true, articleError: null });
    try {
      const article = await readingApi.loadArticle(thread.url, true);
      set({ article, articleLoading: false });
    } catch (err) {
      set({ articleLoading: false, articleError: String(err) });
    }
  },
  setTab: (tab) => set({ tab }),
  toggleCollapse: (id) => {
    const collapsed = new Set(get().collapsed);
    if (collapsed.has(id)) {
      collapsed.delete(id);
    } else {
      collapsed.add(id);
    }
    set({ collapsed });
  },
  collapseAll: () => {
    const thread = get().thread;
    if (!thread) {
      return;
    }
    set({ collapsed: new Set(thread.comments.map((comment) => comment.id)) });
  },
  expandAll: () => set({ collapsed: new Set() }),
  jumpToComment: (id) => set({ tab: "comments", jumpTarget: id }),
  clearJump: () => set({ jumpTarget: null }),
});
