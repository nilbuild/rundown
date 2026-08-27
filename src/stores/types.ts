import type { VerifyReport } from "~/lib/api/outputs";
import type { FeedSlice } from "./feed";
import type { ThreadSlice } from "./thread";
import type { CommentsSlice } from "./comments";
import type { OutputsSlice } from "./outputs";
import type { ChatSlice } from "./chat";
import type { UiSlice } from "./ui";
import type { SynthesisSlice } from "./synthesis";
import type { SettingsSlice } from "./settings";

export type Tab = "rundown" | "article" | "comments" | "digest";
export type View = "reader" | "synthesis";

export interface OutputState {
  text: string;
  streaming: boolean;
  error: string | null;
  report: VerifyReport | null;
  runId: string | null;
  durationMs: number | null;
  fromCache: boolean;
}

export type AppState = FeedSlice &
  ThreadSlice &
  CommentsSlice &
  OutputsSlice &
  ChatSlice &
  UiSlice &
  SynthesisSlice &
  SettingsSlice & {
  bootstrap: () => Promise<void>;
};
