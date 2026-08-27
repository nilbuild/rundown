import { invoke } from "@tauri-apps/api/core";

export interface LibraryHit {
  storyId: number;
  title: string;
  kind: string;
  /// Matched text with <b> around the query terms.
  snippet: string;
  createdAt: number;
}

export interface LibraryStats {
  entries: number;
  stories: number;
}

export interface HistoryEntry {
  storyId: number;
  title: string;
  readAt: number;
  commentCount: number;
  kinds: string[];
}

export function librarySearch(query: string) {
  return invoke<LibraryHit[]>("library_search", { query });
}

export function libraryStats() {
  return invoke<LibraryStats>("library_stats");
}

export function readingHistory() {
  return invoke<HistoryEntry[]>("reading_history");
}
