import type { StateCreator } from "zustand";
import * as api from "~/lib/api";
import { newRunId, trackRun } from "~/lib/runs";
import type { AppState } from "./types";
import type { ChatMessage, Selection } from "~/types";

export interface ChatSlice {
  chatMessages: ChatMessage[];
  chatStreaming: string;
  chatBusy: boolean;
  chatRunId: string | null;
  chatError: string | null;
  selection: Selection | null;
  chatOpen: boolean;
  setSelection: (selection: Selection | null) => void;
  sendChat: (message: string) => Promise<void>;
  stopChat: () => Promise<void>;
  resetChat: () => Promise<void>;
  setChatOpen: (open: boolean) => void;
}

export const createChatSlice: StateCreator<AppState, [], [], ChatSlice> = (
  set,
  get,
) => ({
  chatMessages: [],
  chatStreaming: "",
  chatBusy: false,
  chatRunId: null,
  chatError: null,

  selection: null,
  chatOpen: true,

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
});

let localMessageId = 0;
function nextMessageId() {
  localMessageId -= 1;
  return localMessageId;
}
