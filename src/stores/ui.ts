import type { StateCreator } from "zustand";
import type { AppState } from "./types";
import type { View } from "./types";

export interface UiSlice {
  paletteOpen: boolean;
  settingsOpen: boolean;
  presetsOpen: boolean;
  libraryOpen: boolean;
  view: View;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPresetsOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setView: (view: View) => void;
}

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  paletteOpen: false,
  settingsOpen: false,
  presetsOpen: false,
  libraryOpen: false,
  view: "reader",

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPresetsOpen: (presetsOpen) => set({ presetsOpen }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setView: (view) => set({ view }),
});
