import { create } from "zustand";
import * as api from "../lib/api";
import { newRunId, trackRun, watchRateLimit } from "../lib/runs";
import type {
  Article,
  ChatMessage,
  Coverage,
  FeedName,
  OutputKind,
  Provider,
  ProviderStatus,
  RateLimit,
  Selection,
  Models,
  ModelSlot,
  PrefetchMode,
  ReadLevel,
  Preset,
  Story,
  Thread,
  VerifyReport,
} from "../lib/types";

export type Tab = "rundown" | "article" | "comments" | "digest";

export interface OutputState {
  text: string;
  streaming: boolean;
  error: string | null;
  report: VerifyReport | null;
  runId: string | null;
  durationMs: number | null;
  fromCache: boolean;
}

function emptyOutput(): OutputState {
  return {
    text: "",
    streaming: false,
    error: null,
    report: null,
    runId: null,
    durationMs: null,
    fromCache: false,
  };
}

interface AppState {
  feed: FeedName;
  stories: Story[];
  loadingFeed: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  feedError: string | null;
  searchQuery: string;
  searching: boolean;
  readIds: Set<number>;

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

  commentQuery: string;
  matchIds: number[];
  matchIndex: number;
  newIds: number[];
  newIndex: number;
  /// New comments the reader has actually had on screen, so the marker can
  /// retire itself instead of shouting "new" at already-read text.
  seenNew: Set<number>;

  tab: Tab;
  outputs: Record<OutputKind, OutputState>;

  chatMessages: ChatMessage[];
  chatStreaming: string;
  chatBusy: boolean;
  chatRunId: string | null;
  chatError: string | null;

  selection: Selection | null;

  paletteOpen: boolean;
  settingsOpen: boolean;
  presetsOpen: boolean;
  chatOpen: boolean;
  jumpTarget: number | null;

  provider: Provider;
  models: Models;
  presets: Preset[];
  prefetch: PrefetchMode;
  prefetching: boolean;
  /// A run is scheduled but the delay has not elapsed yet.
  prefetchPending: boolean;
  readLevel: ReadLevel;
  providerStatus: ProviderStatus | null;
  rateLimit: RateLimit | null;

  bootstrap: () => Promise<void>;
  setFeed: (feed: FeedName) => Promise<void>;
  refreshFeed: (manual?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  runSearch: (query: string) => Promise<void>;
  clearSearch: () => Promise<void>;
  selectStory: (id: number) => Promise<void>;
  reloadStory: () => Promise<void>;
  schedulePrefetch: (id: number) => void;
  setTab: (tab: Tab) => void;
  toggleCollapse: (id: number) => void;
  collapseAll: () => void;
  expandAll: () => void;

  runOutput: (kind: OutputKind, refresh?: boolean) => Promise<void>;
  stopOutput: (kind: OutputKind) => Promise<void>;

  setSelection: (selection: Selection | null) => void;
  sendChat: (message: string) => Promise<void>;
  stopChat: () => Promise<void>;
  resetChat: () => Promise<void>;
  setChatOpen: (open: boolean) => void;

  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPresetsOpen: (open: boolean) => void;
  setProvider: (provider: Provider) => Promise<void>;
  setModelFor: (slot: ModelSlot, model: string | null) => Promise<void>;
  setPrefetch: (mode: PrefetchMode) => Promise<void>;
  setReadLevel: (level: ReadLevel) => Promise<void>;
  addPreset: (label: string, prompt: string) => Promise<void>;
  updatePreset: (id: string, label: string, prompt: string) => Promise<void>;
  removePreset: (id: string) => Promise<void>;
  runPreset: (id: string) => Promise<void>;
  jumpToComment: (id: number) => void;
  clearJump: () => void;

  retryArticle: () => Promise<void>;
  setCommentQuery: (query: string) => void;
  stepMatch: (direction: 1 | -1) => void;
  stepTopLevel: (direction: 1 | -1) => void;
  stepNew: (direction: 1 | -1) => void;
  markNewSeen: (id: number) => void;
  markAllNewSeen: () => void;
}

const PAGE = 30;

/// The digest is the output worth spending on, so it defaults to the strongest
/// model. The brief is a throwaway summary and the chat needs to feel
/// responsive, so both default lower.
const DEFAULT_MODELS: Models = {
  rundown: "opus",
  digest: "opus",
  brief: "haiku",
  chat: "sonnet",
};

/// Seeded so the feature is useful before you have saved anything. These are
/// the questions worth asking of almost any thread.
const DEFAULT_PRESETS: Preset[] = [
  {
    id: "takes",
    label: "Best takes",
    prompt: "What are the most thoughtful takes in this thread?",
  },
  {
    id: "disagreement",
    label: "The disagreement",
    prompt:
      "Where do people genuinely disagree here, and who has the better argument? Quote both sides.",
  },
  {
    id: "surprise",
    label: "What surprised you",
    prompt:
      "What did someone say here that a well-informed reader would not already know? Skip anything obvious.",
  },
  {
    id: "talkingpast",
    label: "Talking past it?",
    prompt:
      "Is this thread engaging with the article's actual claim, or with the headline? State the "
      + "article's central claim, name the comments that take it seriously, name the tangents, "
      + "and give a one-line verdict.",
  },
  {
    id: "wrong",
    label: "What's wrong",
    prompt:
      "What claims in this thread are wrong, unsupported, or would not survive scrutiny? Be specific and cite them.",
  },
];

/// Wait before speculatively digesting, so paging through the list with j/k
/// does not fire a run per story.
const PREFETCH_DELAY = 2500;
let prefetchTimer: number | undefined;

/// Ids of comments posted after `since`, depth-first so stepping through them
/// follows reading order rather than post order.
function freshIds(thread: Thread, since: number | null) {
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

let localMessageId = 0;
function nextMessageId() {
  localMessageId -= 1;
  return localMessageId;
}

export const useApp = create<AppState>((set, get) => ({
  feed: "top",
  stories: [],
  loadingFeed: false,
  refreshing: false,
  loadingMore: false,
  hasMore: true,
  feedError: null,
  searchQuery: "",
  searching: false,
  readIds: new Set(),

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

  commentQuery: "",
  matchIds: [],
  matchIndex: 0,
  newIds: [],
  newIndex: 0,
  seenNew: new Set(),

  tab: "rundown",
  outputs: {
    rundown: emptyOutput(),
    digest: emptyOutput(),
    brief: emptyOutput(),
  },

  chatMessages: [],
  chatStreaming: "",
  chatBusy: false,
  chatRunId: null,
  chatError: null,

  selection: null,

  paletteOpen: false,
  settingsOpen: false,
  presetsOpen: false,
  chatOpen: true,
  jumpTarget: null,

  provider: "claude",
  models: DEFAULT_MODELS,
  presets: DEFAULT_PRESETS,
  prefetch: "rundown",
  prefetching: false,
  prefetchPending: false,
  readLevel: "skim",
  providerStatus: null,
  rateLimit: null,

  bootstrap: async () => {
    watchRateLimit((rateLimit) => set({ rateLimit }));

    const [settings, status, seen] = await Promise.all([
      api.settingsAll().catch(() => ({}) as Record<string, unknown>),
      api.providers().catch(() => null),
      api.readIds().catch(() => [] as number[]),
    ]);

    const stored = (settings.models ?? {}) as Partial<Models>;
    set({
      provider: (settings.provider as Provider) ?? "claude",
      models: {
        rundown: stored.rundown !== undefined ? stored.rundown : DEFAULT_MODELS.rundown,
        digest: stored.digest !== undefined ? stored.digest : DEFAULT_MODELS.digest,
        brief: stored.brief !== undefined ? stored.brief : DEFAULT_MODELS.brief,
        chat: stored.chat !== undefined ? stored.chat : DEFAULT_MODELS.chat,
      },
      // The setting used to be a boolean; keep old installs working.
      prefetch:
        typeof settings.prefetch === "string"
          ? (settings.prefetch as PrefetchMode)
          : settings.prefetch === false
            ? "off"
            : "rundown",
      readLevel: (settings.readLevel as ReadLevel) ?? "skim",
      presets: Array.isArray(settings.presets)
        ? (settings.presets as Preset[])
        : DEFAULT_PRESETS,
      providerStatus: status,
      readIds: new Set(seen),
    });

    await get().refreshFeed();
  },

  setFeed: async (feed) => {
    if (get().feed === feed && !get().searching) {
      return;
    }
    // Clearing first is what lets the skeleton appear instead of the old feed
    // sitting there looking current.
    set({ feed, searchQuery: "", searching: false, stories: [], hasMore: true });
    await get().refreshFeed();
  },

  refreshFeed: async (manual = false) => {
    set({ loadingFeed: true, feedError: null, refreshing: manual });
    try {
      const stories = await api.loadFeed(get().feed, 0, PAGE);
      set({ stories, loadingFeed: false, refreshing: false, hasMore: stories.length === PAGE });
    } catch (err) {
      set({ loadingFeed: false, refreshing: false, feedError: String(err) });
    }
  },

  loadMore: async () => {
    const state = get();
    if (state.searching || state.loadingMore || state.loadingFeed || !state.hasMore) {
      return;
    }
    set({ loadingMore: true });
    try {
      const next = await api.loadFeed(state.feed, state.stories.length, PAGE);
      const seen = new Set(state.stories.map((story) => story.id));
      const fresh = next.filter((story) => !seen.has(story.id));
      set((current) => ({
        stories: [...current.stories, ...fresh],
        loadingMore: false,
        hasMore: next.length === PAGE,
      }));
    } catch {
      set({ loadingMore: false, hasMore: false });
    }
  },

  runSearch: async (query) => {
    const trimmed = query.trim();
    if (!trimmed) {
      await get().clearSearch();
      return;
    }
    set({
      loadingFeed: true,
      feedError: null,
      searchQuery: trimmed,
      searching: true,
      stories: [],
    });
    try {
      const stories = await api.searchStories(trimmed, false);
      set({ stories, loadingFeed: false, refreshing: false, hasMore: false });
    } catch (err) {
      set({ loadingFeed: false, refreshing: false, feedError: String(err) });
    }
  },

  clearSearch: async () => {
    set({ searchQuery: "", searching: false });
    await get().refreshFeed();
  },

  selectStory: async (id) => {
    if (get().selectedId === id) {
      return;
    }

    const readIds = new Set(get().readIds);
    readIds.add(id);

    // Abandon any work for the story being left behind — all of it, not just
    // the speculative rundown.
    window.clearTimeout(prefetchTimer);
    const leaving = get();
    for (const output of Object.values(leaving.outputs)) {
      if (output.streaming && output.runId) {
        api.cancelRun(output.runId).catch(() => undefined);
      }
    }
    if (leaving.chatBusy && leaving.chatRunId) {
      api.cancelRun(leaving.chatRunId).catch(() => undefined);
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
      const view = await api.loadThread(id);
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

      api
        .chatHistory(`story:${id}`)
        .then((messages) => {
          if (get().selectedId !== id) {
            return;
          }
          set({ chatMessages: messages });
        })
        .catch(() => undefined);

      api
        .coverage(id)
        .then((coverage) => {
          if (get().selectedId !== id) {
            return;
          }
          set({ coverage });
        })
        .catch(() => undefined);

      for (const kind of ["rundown", "digest", "brief"] as OutputKind[]) {
        api
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
        api
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

  schedulePrefetch: (id) => {
    window.clearTimeout(prefetchTimer);
    set({ prefetchPending: false });

    const start = get();
    if (start.prefetch === "off" || !start.thread) {
      return;
    }
    // Decide now whether a run is actually coming, so the tab can say so
    // instead of offering a button for work that is already scheduled.
    if (start.outputs.rundown.text || start.outputs.rundown.streaming) {
      return;
    }
    if (start.thread.comment_count < 5) {
      return;
    }
    set({ prefetchPending: true });

    prefetchTimer = window.setTimeout(async () => {
      const state = get();
      if (state.selectedId !== id || !state.thread) {
        set({ prefetchPending: false });
        return;
      }
      if (state.outputs.rundown.text || state.outputs.rundown.streaming) {
        set({ prefetchPending: false });
        return;
      }
      set({ prefetching: true, prefetchPending: false });
      await get().runOutput("rundown");

      // The digest is a second, separate run, so it only happens on request.
      if (get().prefetch === "both" && get().selectedId === id) {
        const digest = get().outputs.digest;
        if (!digest.text && !digest.streaming) {
          await get().runOutput("digest");
        }
      }
      if (get().selectedId === id) {
        set({ prefetching: false });
      }
    }, PREFETCH_DELAY);
  },

  reloadStory: async () => {
    const id = get().selectedId;
    if (!id) {
      return;
    }
    set({ loadingThread: true, threadError: null });
    try {
      const view = await api.loadThread(id, true);
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
          const article = await api.loadArticle(view.thread.url, true);
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
      const article = await api.loadArticle(thread.url, true);
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

  runOutput: async (kind, refresh = false) => {
    const state = get();
    const storyId = state.selectedId;
    if (!storyId) {
      return;
    }
    if (state.outputs[kind].streaming) {
      return;
    }

    if (kind === "rundown") {
      window.clearTimeout(prefetchTimer);
    }

    const runId = newRunId();
    set((current) => ({
      outputs: {
        ...current.outputs,
        [kind]: { ...emptyOutput(), streaming: true, runId },
      },
      prefetchPending: kind === "rundown" ? false : current.prefetchPending,
    }));

    // A run outlives the story that started it: cancelling is asynchronous, and
    // tokens already in flight still arrive. Without this guard they land in
    // whichever story happens to be open, which shows one thread's digest under
    // another thread's title.
    const stillHere = () => get().selectedId === storyId;

    const patch = (next: Partial<OutputState>) => {
      if (!stillHere()) {
        return;
      }
      set((current) => ({
        outputs: { ...current.outputs, [kind]: { ...current.outputs[kind], ...next } },
      }));
    };

    trackRun(runId, {
      onDelta: (text) => {
        if (!stillHere()) {
          return;
        }
        set((current) => ({
          outputs: {
            ...current.outputs,
            [kind]: {
              ...current.outputs[kind],
              text: current.outputs[kind].text + text,
            },
          },
        }));
      },
      onDone: (payload) => {
        patch({
          streaming: false,
          text: payload.text || get().outputs[kind].text,
          report: payload.report,
          durationMs: payload.durationMs,
          runId: null,
        });
      },
      onError: (message) => {
        patch({ streaming: false, error: message, runId: null });
      },
    });

    await api
      .generate({
        runId,
        kind,
        storyId,
        provider: state.provider,
        model: state.models[kind],
        refresh,
      })
      .catch((err) => {
        patch({ streaming: false, error: String(err), runId: null });
      });
  },

  stopOutput: async (kind) => {
    const runId = get().outputs[kind].runId;
    if (!runId) {
      return;
    }
    await api.cancelRun(runId).catch(() => undefined);
    set((current) => ({
      outputs: {
        ...current.outputs,
        [kind]: { ...current.outputs[kind], streaming: false, runId: null },
      },
    }));
  },

  setSelection: (selection) => set({ selection }),

  sendChat: async (message) => {
    const state = get();
    const storyId = state.selectedId;
    if (!storyId || state.chatBusy) {
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }

    const selection = state.selection;
    const runId = newRunId();
    const optimistic: ChatMessage = {
      id: nextMessageId(),
      chatId: `story:${storyId}`,
      role: "user",
      content: selection ? `> ${selection.text}\n\n${trimmed}` : trimmed,
      createdAt: Date.now() / 1000,
    };

    set({
      chatBusy: true,
      chatRunId: runId,
      chatStreaming: "",
      chatError: null,
      chatMessages: [...state.chatMessages, optimistic],
      selection: null,
      chatOpen: true,
    });

    const stillHere = () => get().selectedId === storyId;

    trackRun(runId, {
      onDelta: (text) => {
        if (!stillHere()) {
          return;
        }
        set((current) => ({ chatStreaming: current.chatStreaming + text }));
      },
      onDone: (payload) => {
        if (!stillHere()) {
          return;
        }
        set((current) => ({
          chatBusy: false,
          chatRunId: null,
          chatStreaming: "",
          chatMessages: [
            ...current.chatMessages,
            {
              id: nextMessageId(),
              chatId: `story:${storyId}`,
              role: "assistant",
              content: payload.text || current.chatStreaming,
              createdAt: Date.now() / 1000,
            },
          ],
        }));
      },
      onError: (message) => {
        if (!stillHere()) {
          return;
        }
        set({ chatBusy: false, chatRunId: null, chatStreaming: "", chatError: message });
      },
    });

    await api
      .chatSend({
        runId,
        chatId: `story:${storyId}`,
        storyId,
        provider: state.provider,
        model: state.models.chat,
        message: trimmed,
        selection: selection?.text ?? null,
        selectionSource: selection?.source ?? null,
      })
      .catch((err) => {
        if (!stillHere()) {
          return;
        }
        set({ chatBusy: false, chatRunId: null, chatStreaming: "", chatError: String(err) });
      });
  },

  stopChat: async () => {
    const runId = get().chatRunId;
    if (!runId) {
      return;
    }
    await api.cancelRun(runId).catch(() => undefined);
    set({ chatBusy: false, chatRunId: null, chatStreaming: "" });
  },

  resetChat: async () => {
    const storyId = get().selectedId;
    if (!storyId) {
      return;
    }
    await api.chatClear(`story:${storyId}`).catch(() => undefined);
    set({ chatMessages: [], chatStreaming: "", chatError: null });
  },

  setChatOpen: (chatOpen) => set({ chatOpen }),

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPresetsOpen: (presetsOpen) => set({ presetsOpen }),

  setProvider: async (provider) => {
    set({ provider });
    await api.settingsSet("provider", provider).catch(() => undefined);
  },

  setModelFor: async (slot, model) => {
    const models = { ...get().models, [slot]: model };
    set({ models });
    await api.settingsSet("models", models).catch(() => undefined);
  },

  addPreset: async (label, prompt) => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel || !trimmedPrompt) {
      return;
    }
    const presets = [
      ...get().presets,
      {
        id: `p${Date.now().toString(36)}`,
        label: trimmedLabel,
        prompt: trimmedPrompt,
      },
    ];
    set({ presets });
    await api.settingsSet("presets", presets).catch(() => undefined);
  },

  updatePreset: async (id, label, prompt) => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel || !trimmedPrompt) {
      return;
    }
    const presets = get().presets.map((preset) =>
      preset.id === id ? { ...preset, label: trimmedLabel, prompt: trimmedPrompt } : preset,
    );
    set({ presets });
    await api.settingsSet("presets", presets).catch(() => undefined);
  },

  removePreset: async (id) => {
    const presets = get().presets.filter((preset) => preset.id !== id);
    set({ presets });
    await api.settingsSet("presets", presets).catch(() => undefined);
  },

  runPreset: async (id) => {
    const preset = get().presets.find((entry) => entry.id === id);
    if (!preset) {
      return;
    }
    set({ chatOpen: true });
    await get().sendChat(preset.prompt);
  },

  setReadLevel: async (level) => {
    set({ readLevel: level });
    await api.settingsSet("readLevel", level).catch(() => undefined);
  },

  setPrefetch: async (mode) => {
    set({ prefetch: mode });
    if (mode === "off") {
      window.clearTimeout(prefetchTimer);
      set({ prefetchPending: false });
    }
    await api.settingsSet("prefetch", mode).catch(() => undefined);
  },

  jumpToComment: (id) => set({ tab: "comments", jumpTarget: id }),
  clearJump: () => set({ jumpTarget: null }),

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

  stepNew: (direction) => {
    const { newIds, newIndex } = get();
    if (newIds.length === 0) {
      return;
    }
    const next = (newIndex + direction + newIds.length) % newIds.length;
    set({ tab: "comments", newIndex: next, jumpTarget: newIds[next], collapsed: new Set() });
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
}));
