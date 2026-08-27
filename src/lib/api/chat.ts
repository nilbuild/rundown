import { invoke } from "@tauri-apps/api/core";

import type { Provider } from "~/lib/api/settings";

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

export interface ChatMessage {
  id: number;
  chatId: string;
  role: string;
  content: string;
  createdAt: number;
}

export interface Selection {
  text: string;
  source: string;
  commentId?: number;
  author?: string;
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
