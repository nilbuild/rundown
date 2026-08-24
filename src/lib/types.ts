export type FeedName = "top" | "best" | "new" | "ask" | "show" | "jobs";

export type Provider = "claude" | "codex";

export type OutputKind = "rundown" | "digest" | "brief";

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

export type CitationStatus =
  | "exact"
  | "loose"
  | "mismatch"
  | "unknown"
  | "wrongauthor";

export interface Citation {
  commentId: number;
  claimedAuthor: string;
  actualAuthor: string | null;
  quote: string;
  status: CitationStatus;
}

export interface VerifyReport {
  citations: Citation[];
  exact: number;
  loose: number;
  problems: number;
}

export interface CachedOutput {
  markdown: string;
  provider: string;
  model: string | null;
  createdAt: number;
  report: VerifyReport | null;
}

export interface ChatMessage {
  id: number;
  chatId: string;
  role: string;
  content: string;
  createdAt: number;
}

export interface ThreadView {
  thread: Thread;
  newComments: number | null;
  lastVisit: number | null;
}

export type ModelSlot = "rundown" | "digest" | "brief" | "chat";

export type ReadLevel = "gist" | "skim" | "full";

/// What the app makes in advance when you open a thread.
export type PrefetchMode = "off" | "rundown" | "both";

/// A saved question that can be fired at any thread.
export interface Preset {
  id: string;
  label: string;
  prompt: string;
}

export type Models = Record<ModelSlot, string | null>;

/// Model names belong to one provider. Claude's `opus` means nothing to Codex,
/// so choices are kept apart rather than shared.
export type ProviderModels = Partial<Record<Provider, Partial<Models>>>;

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

export interface Synthesis {
  id: number;
  title: string;
  storyIds: number[];
  markdown: string;
  createdAt: number;
}

export interface Coverage {
  included: number;
  total: number;
  chars: number;
}

export interface ModelOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ProviderStatus {
  claude: string | null;
  codex: string | null;
}

export interface RateLimit {
  status: string;
  window: string | null;
  resetsAt: number | null;
}

export type AiEvent =
  | {
      kind: "started";
      runId: string;
      provider: Provider;
      model: string | null;
      sessionId: string | null;
    }
  | { kind: "delta"; runId: string; text: string }
  | {
      kind: "rateLimit";
      runId: string;
      status: string;
      window: string | null;
      resetsAt: number | null;
    }
  | {
      kind: "done";
      runId: string;
      text: string;
      sessionId: string | null;
      durationMs: number;
      costUsd: number | null;
      report: VerifyReport | null;
    }
  | { kind: "error"; runId: string; message: string };

export interface Selection {
  text: string;
  source: string;
  commentId?: number;
  author?: string;
}
