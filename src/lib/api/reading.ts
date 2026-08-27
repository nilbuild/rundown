import { invoke } from "@tauri-apps/api/core";

export type FeedName = "top" | "best" | "new" | "ask" | "show" | "jobs";

export interface Story {
  id: number;
  title: string;
  url: string | null;
  domain: string | null;
  by: string;
  score: number;
  descendants: number;
  time: number;
  text: string | null;
  kind: string;
}

export interface Comment {
  id: number;
  author: string | null;
  html: string;
  text: string;
  created_at: string;
  depth: number;
  children: Comment[];
  subtree_size: number;
}

export interface Thread {
  id: number;
  title: string;
  url: string | null;
  domain: string | null;
  author: string | null;
  points: number | null;
  created_at: string;
  text: string | null;
  comments: Comment[];
  comment_count: number;
}

export interface ThreadView {
  thread: Thread;
  newComments: number | null;
  lastVisit: number | null;
}

export interface Article {
  url: string;
  title: string;
  byline: string | null;
  site_name: string | null;
  excerpt: string | null;
  published_time: string | null;
  markdown: string;
  word_count: number;
  note: string | null;
}

export interface Coverage {
  included: number;
  total: number;
  chars: number;
}

export function loadFeed(feed: FeedName, offset: number, limit: number) {
  return invoke<Story[]>("feed", { feed, offset, limit });
}

export function searchStories(query: string, byDate: boolean) {
  return invoke<Story[]>("search_stories", { query, byDate });
}

export function loadThread(id: number, refresh = false) {
  return invoke<ThreadView>("load_thread", { id, refresh });
}

export function loadArticle(url: string, refresh = false) {
  return invoke<Article>("load_article", { url, refresh });
}

export function readIds() {
  return invoke<number[]>("read_ids");
}

export function coverage(storyId: number) {
  return invoke<Coverage>("coverage", { storyId });
}

export function resolveItem(id: number) {
  return invoke<{ storyId: number; commentId: number | null }>("resolve_item", { id });
}
