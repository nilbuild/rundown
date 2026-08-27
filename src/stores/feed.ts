import type { StateCreator } from "zustand";
import * as readingApi from "~/lib/api/reading";
import type { AppState } from "./types";
import type { FeedName, Story } from "~/lib/api/reading";

const PAGE = 30;

export interface FeedSlice {
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
  setFeed: (feed: FeedName) => Promise<void>;
  refreshFeed: (manual?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  runSearch: (query: string) => Promise<void>;
  clearSearch: () => Promise<void>;
}

export const createFeedSlice: StateCreator<AppState, [], [], FeedSlice> = (
  set,
  get,
) => ({
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
      const stories = await readingApi.loadFeed(get().feed, 0, PAGE);
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
      const next = await readingApi.loadFeed(state.feed, state.stories.length, PAGE);
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
      const stories = await readingApi.searchStories(trimmed, false);
      set({ stories, loadingFeed: false, refreshing: false, hasMore: false });
    } catch (err) {
      set({ loadingFeed: false, refreshing: false, feedError: String(err) });
    }
  },
  clearSearch: async () => {
    set({ searchQuery: "", searching: false });
    await get().refreshFeed();
  },
});
