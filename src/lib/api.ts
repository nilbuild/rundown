import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  Article,
  CachedOutput,
  ChatMessage,
  Coverage,
  FeedName,
  OutputKind,
  Provider,
  ProviderStatus,
  HistoryEntry,
  LibraryHit,
  LibraryStats,
  ModelOption,
  Synthesis,
  Story,
  ThreadView,
} from "./types";

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

export interface GenerateArgs {
  runId: string;
  kind: OutputKind;
  storyId: number;
  provider: Provider;
  model?: string | null;
  refresh?: boolean;
}

export function generate(args: GenerateArgs) {
  return invoke<void>("generate", { args });
}

export function cachedOutput(storyId: number, kind: OutputKind) {
  return invoke<CachedOutput | null>("cached_output", { storyId, kind });
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

export interface SynthesiseArgs {
  runId: string;
  storyIds: number[];
  provider: Provider;
  model?: string | null;
  instruction: string;
  title?: string;
}

export function synthesise(args: SynthesiseArgs) {
  return invoke<void>("synthesise", { args });
}

export function synthesisList() {
  return invoke<Synthesis[]>("synthesis_list");
}

export function synthesisDelete(id: number) {
  return invoke<void>("synthesis_delete", { id });
}

export function cachedKinds(storyId: number) {
  return invoke<string[]>("cached_kinds", { storyId });
}

export interface ChatArgs {
  runId: string;
  chatId: string;
  storyId: number;
  provider: Provider;
  model?: string | null;
  message: string;
  selection?: string | null;
  selectionSource?: string | null;
}

export function chatSend(args: ChatArgs) {
  return invoke<void>("chat_send", { args });
}

export function chatHistory(chatId: string) {
  return invoke<ChatMessage[]>("chat_history", { chatId });
}

export function chatClear(chatId: string) {
  return invoke<void>("chat_clear", { chatId });
}

export function cancelRun(runId: string) {
  return invoke<boolean>("cancel_run", { runId });
}

export function settingsAll() {
  return invoke<Record<string, unknown>>("settings_all");
}

export function settingsSet(key: string, value: unknown) {
  return invoke<void>("settings_set", { key, value });
}

export function availableModels(provider: Provider) {
  return invoke<ModelOption[]>("available_models", { provider });
}

/// Slow the first time (it starts the CLI once per alias) and instant after,
/// so callers should fire it and let the answer land rather than await it
/// before drawing.
export function resolveModels(provider: Provider) {
  return invoke<Record<string, string>>("resolve_models", { provider });
}

export function providers() {
  return invoke<ProviderStatus>("providers");
}

export function dataLocation() {
  return invoke<string>("data_location");
}

export function openExternal(url: string) {
  return openUrl(url);
}
