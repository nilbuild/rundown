import type { StateCreator } from "zustand";
import { applyTheme, prefersDark, readTheme, resolveTheme, storeTheme } from "~/utils/theme";
import type { Palette, ThemeId } from "~/utils/theme";
import type { AppState } from "./types";
import type { View } from "./types";

export interface UiSlice {
  paletteOpen: boolean;
  settingsOpen: boolean;
  presetsOpen: boolean;
  libraryOpen: boolean;
  view: View;
  theme: ThemeId;
  /// The palette actually on the document. Differs from `theme` only while it
  /// is set to "system".
  palette: Palette;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPresetsOpen: (open: boolean) => void;
  setLibraryOpen: (open: boolean) => void;
  setView: (view: View) => void;
  setTheme: (theme: ThemeId) => void;
  syncSystemTheme: () => void;
}

/// Read once. The script in index.html has already applied the same answer to
/// the document, so the two agree without either having to ask the other.
const STORED_THEME = readTheme();

export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set, get) => ({
  paletteOpen: false,
  settingsOpen: false,
  presetsOpen: false,
  libraryOpen: false,
  view: "reader",
  theme: STORED_THEME,
  palette: resolveTheme(STORED_THEME, prefersDark()),

  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPresetsOpen: (presetsOpen) => set({ presetsOpen }),
  setLibraryOpen: (libraryOpen) => set({ libraryOpen }),
  setView: (view) => set({ view }),

  setTheme: (theme) => {
    storeTheme(theme);
    set({ theme, palette: applyTheme(theme) });
  },
  syncSystemTheme: () => set({ palette: applyTheme(get().theme) }),
});
