/// Themes are kept in localStorage rather than the settings store, because the
/// document needs one before React mounts. Anything read over IPC arrives after
/// the first paint, which is a flash of the wrong palette on every launch.
export const STORAGE_KEY = "rundown.theme";

/// The palettes defined in `styles/base.css`. `system` is a choice, not a
/// palette — it resolves to one of the others.
export type Palette = "paper" | "sepia" | "dusk" | "midnight";

export type ThemeId = Palette | "system";

export interface Theme {
  id: ThemeId;
  label: string;
  hint: string;
}

export const THEMES: Theme[] = [
  { id: "system", label: "System", hint: "Follow the macOS appearance" },
  { id: "paper", label: "Paper", hint: "Warm off-white" },
  { id: "sepia", label: "Sepia", hint: "Cream, for long reading" },
  { id: "dusk", label: "Dusk", hint: "Warm dark" },
  { id: "midnight", label: "Midnight", hint: "Cool near-black" },
];

const PALETTES: Palette[] = ["paper", "sepia", "dusk", "midnight"];

export function isThemeId(value: unknown): value is ThemeId {
  return value === "system" || PALETTES.includes(value as Palette);
}

export function resolveTheme(theme: ThemeId, dark: boolean): Palette {
  if (theme !== "system") {
    return theme;
  }
  return dark ? "dusk" : "paper";
}

export function prefersDark(): boolean {
  // Guarded because the store this feeds is also loaded by unit tests, which
  // run outside a browser.
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(theme: ThemeId): Palette {
  const palette = resolveTheme(theme, prefersDark());
  document.documentElement.dataset.theme = palette;
  return palette;
}

export function readTheme(): ThemeId {
  // Private browsing and a wiped webview both throw rather than return null.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeId(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function storeTheme(theme: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Nothing to do — the choice still applies for this session.
  }
}
