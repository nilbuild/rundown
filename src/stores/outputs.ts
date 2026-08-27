import type { StateCreator } from "zustand";
import * as outputsApi from "~/lib/api/outputs";
import { newRunId, trackRun } from "~/lib/runs";
import type { AppState } from "./types";
import type { OutputKind } from "~/lib/api/outputs";
import type { OutputState } from "./types";
import { cancelPrefetch, startPrefetch } from "./prefetch";

export interface OutputsSlice {
  outputs: Record<OutputKind, OutputState>;
  schedulePrefetch: (id: number) => void;
  runOutput: (kind: OutputKind, refresh?: boolean) => Promise<void>;
  stopOutput: (kind: OutputKind) => Promise<void>;
}

export const createOutputsSlice: StateCreator<AppState, [], [], OutputsSlice> = (
  set,
  get,
) => ({
  outputs: {
    rundown: emptyOutput(),
    digest: emptyOutput(),
    brief: emptyOutput(),
  },
  prefetching: false,
  prefetchPending: false,

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
      cancelPrefetch();
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

    await outputsApi
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
    await outputsApi.cancelRun(runId).catch(() => undefined);
    set((current) => ({
      outputs: {
        ...current.outputs,
        [kind]: { ...current.outputs[kind], streaming: false, runId: null },
      },
    }));
  },
  schedulePrefetch: (id) => {
    cancelPrefetch();
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

    startPrefetch(async () => {
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
    });
  },
});

export function emptyOutput(): OutputState {
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

