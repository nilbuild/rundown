import { invoke } from "@tauri-apps/api/core";

import type { Provider } from "~/lib/api/settings";

export interface GenerateArgs {
  runId: string;
  kind: OutputKind;
  storyId: number;
  provider: Provider;
  model?: string | null;
  refresh?: boolean;
}

export type OutputKind = "rundown" | "digest" | "brief";

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



export function generate(args: GenerateArgs) {
  return invoke<void>("generate", { args });
}

export function cachedOutput(storyId: number, kind: OutputKind) {
  return invoke<CachedOutput | null>("cached_output", { storyId, kind });
}

export function cachedKinds(storyId: number) {
  return invoke<string[]>("cached_kinds", { storyId });
}

export function cancelRun(runId: string) {
  return invoke<boolean>("cancel_run", { runId });
}
