import type { StateCreator } from "zustand";
import * as api from "~/lib/api";
import { newRunId, trackRun } from "~/lib/runs";
import type { AppState } from "./types";
import type { Synthesis } from "~/types";

export interface SynthesisSlice {
  picked: Set<number>;
  syntheses: Synthesis[];
  synthesisText: string;
  synthesisBusy: boolean;
  synthesisRunId: string | null;
  synthesisError: string | null;
  activeSynthesis: number | null;
  togglePicked: (storyId: number) => void;
  clearPicked: () => void;
  runSynthesis: (instruction: string) => Promise<void>;
  stopSynthesis: () => Promise<void>;
  loadSyntheses: () => Promise<void>;
  openSynthesis: (id: number) => void;
  removeSynthesis: (id: number) => Promise<void>;
}

export const createSynthesisSlice: StateCreator<AppState, [], [], SynthesisSlice> = (
  set,
  get,
) => ({
  picked: new Set(),
  syntheses: [],
  synthesisText: "",
  synthesisBusy: false,
  synthesisRunId: null,
  synthesisError: null,
  activeSynthesis: null,

  togglePicked: (storyId) => {
    const picked = new Set(get().picked);
    if (picked.has(storyId)) {
      picked.delete(storyId);
    } else {
      picked.add(storyId);
    }
    set({ picked });
  },
  clearPicked: () => set({ picked: new Set() }),
  loadSyntheses: async () => {
    const syntheses = await api.synthesisList().catch(() => [] as Synthesis[]);
    set({ syntheses });
  },
  openSynthesis: (id) => {
    const found = get().syntheses.find((entry) => entry.id === id);
    if (!found) {
      return;
    }
    set({ view: "synthesis", activeSynthesis: id, synthesisText: found.markdown });
  },
  removeSynthesis: async (id) => {
    await api.synthesisDelete(id).catch(() => undefined);
    if (get().activeSynthesis === id) {
      set({ activeSynthesis: null, synthesisText: "" });
    }
    await get().loadSyntheses();
  },
  runSynthesis: async (instruction) => {
    const state = get();
    if (state.synthesisBusy || state.picked.size < 2) {
      return;
    }
    const runId = newRunId();
    set({
      view: "synthesis",
      synthesisBusy: true,
      synthesisRunId: runId,
      synthesisText: "",
      synthesisError: null,
      activeSynthesis: null,
      libraryOpen: false,
    });

    trackRun(runId, {
      onDelta: (text) => {
        set((current) => ({ synthesisText: current.synthesisText + text }));
      },
      onDone: (payload) => {
        set((current) => ({
          synthesisBusy: false,
          synthesisRunId: null,
          synthesisText: payload.text || current.synthesisText,
        }));
        get().loadSyntheses();
      },
      onError: (message) => {
        set({ synthesisBusy: false, synthesisRunId: null, synthesisError: message });
      },
    });

    await api
      .synthesise({
        runId,
        storyIds: Array.from(state.picked),
        provider: state.provider,
        model: state.models.rundown,
        instruction,
      })
      .catch((err) => {
        set({ synthesisBusy: false, synthesisRunId: null, synthesisError: String(err) });
      });
  },
  stopSynthesis: async () => {
    const runId = get().synthesisRunId;
    if (!runId) {
      return;
    }
    await api.cancelRun(runId).catch(() => undefined);
    set({ synthesisBusy: false, synthesisRunId: null });
  },
});
