import type { StateCreator } from "zustand";
import * as settingsApi from "~/lib/api/settings";
import type { AppState } from "./types";
import { cancelPrefetch } from "./prefetch";
import type { ModelOption, ModelSlot, Models, PrefetchMode, Preset, Provider, ProviderModels, ProviderStatus, RateLimit, ReadLevel } from "~/lib/api/settings";

export interface SettingsSlice {
  provider: Provider;
  /// Only the slots you have actually chosen. Anything absent follows the
  /// default, so a slot you never touched keeps tracking it — including slots
  /// added in a later version.
  modelOverrides: ProviderModels;
  models: Models;
  presets: Preset[];
  prefetch: PrefetchMode;
  prefetching: boolean;
  /// A run is scheduled but the delay has not elapsed yet.
  prefetchPending: boolean;
  readLevel: ReadLevel;
  providerStatus: ProviderStatus | null;
  /// What the active provider actually offers, read from it rather than guessed.
  modelOptions: ModelOption[];
  /// Claude alias -> the model it currently points at. Empty for Codex, whose
  /// options are concrete already.
  modelResolved: Record<string, string>;
  rateLimit: RateLimit | null;
  setProvider: (provider: Provider) => Promise<void>;
  setModelFor: (slot: ModelSlot, model: string | null) => Promise<void>;
  resetModels: () => Promise<void>;
  setPrefetch: (mode: PrefetchMode) => Promise<void>;
  setReadLevel: (level: ReadLevel) => Promise<void>;
  addPreset: (label: string, prompt: string) => Promise<void>;
  updatePreset: (id: string, label: string, prompt: string) => Promise<void>;
  removePreset: (id: string) => Promise<void>;
  runPreset: (id: string) => Promise<void>;
}

export const createSettingsSlice: StateCreator<AppState, [], [], SettingsSlice> = (
  set,
  get,
) => ({
  provider: "claude",
  modelOverrides: {},
  models: DEFAULT_MODELS.claude,
  presets: DEFAULT_PRESETS,
  prefetch: "rundown",
  prefetching: false,
  prefetchPending: false,
  readLevel: "skim",
  providerStatus: null,
  modelOptions: [],
  modelResolved: {},
  rateLimit: null,

  setProvider: async (provider) => {
    // The usage figure came from the provider being left behind.
    set({
      provider,
      models: withDefaults(provider, get().modelOverrides),
      rateLimit: null,
    });
    await settingsApi.settingsSet("provider", provider).catch(() => undefined);
    const modelOptions = await settingsApi.availableModels(provider).catch(() => [] as ModelOption[]);
    set({ modelOptions, modelResolved: {} });
    settingsApi
      .resolveModels(provider)
      .then((modelResolved) => {
        // The reader may have switched back while the probe was running.
        if (get().provider !== provider) {
          return;
        }
        set({ modelResolved });
      })
      .catch(() => undefined);
  },
  setModelFor: async (slot, model) => {
    // Persist the one slot that changed, not the merged map. Writing all four
    // would freeze the untouched ones at today's defaults forever.
    const provider = get().provider;
    const current = get().modelOverrides;
    const modelOverrides: ProviderModels = {
      ...current,
      [provider]: { ...(current[provider] ?? {}), [slot]: model },
    };
    set({ modelOverrides, models: withDefaults(provider, modelOverrides) });
    await settingsApi.settingsSet("models", modelOverrides).catch(() => undefined);
  },
  resetModels: async () => {
    const provider = get().provider;
    const modelOverrides = { ...get().modelOverrides };
    delete modelOverrides[provider];
    set({ modelOverrides, models: withDefaults(provider, modelOverrides) });
    await settingsApi.settingsSet("models", modelOverrides).catch(() => undefined);
  },
  addPreset: async (label, prompt) => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel || !trimmedPrompt) {
      return;
    }
    const presets = [
      ...get().presets,
      {
        id: `p${Date.now().toString(36)}`,
        label: trimmedLabel,
        prompt: trimmedPrompt,
      },
    ];
    set({ presets });
    await settingsApi.settingsSet("presets", presets).catch(() => undefined);
  },
  updatePreset: async (id, label, prompt) => {
    const trimmedLabel = label.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedLabel || !trimmedPrompt) {
      return;
    }
    const presets = get().presets.map((preset) =>
      preset.id === id ? { ...preset, label: trimmedLabel, prompt: trimmedPrompt } : preset,
    );
    set({ presets });
    await settingsApi.settingsSet("presets", presets).catch(() => undefined);
  },
  removePreset: async (id) => {
    const presets = get().presets.filter((preset) => preset.id !== id);
    set({ presets });
    await settingsApi.settingsSet("presets", presets).catch(() => undefined);
  },
  runPreset: async (id) => {
    const preset = get().presets.find((entry) => entry.id === id);
    if (!preset) {
      return;
    }
    set({ chatOpen: true });
    await get().sendChat(preset.prompt);
  },
  setReadLevel: async (level) => {
    set({ readLevel: level });
    await settingsApi.settingsSet("readLevel", level).catch(() => undefined);
  },
  setPrefetch: async (mode) => {
    set({ prefetch: mode });
    if (mode === "off") {
      cancelPrefetch();
      set({ prefetchPending: false });
    }
    await settingsApi.settingsSet("prefetch", mode).catch(() => undefined);
  },
});

/// The digest is the output worth spending on, so it defaults to the strongest
/// model. The brief is a throwaway summary and the chat needs to feel
/// responsive, so both default lower.
/// Claude gets named defaults because its aliases are stable and the tradeoff
/// is known. Codex is left on whatever `~/.codex/config.toml` selects, since
/// naming a model it has not got is worse than naming none.
const DEFAULT_MODELS: Record<Provider, Models> = {
  claude: { rundown: "opus", digest: "opus", brief: "haiku", chat: "sonnet" },
  codex: { rundown: null, digest: null, brief: null, chat: null },
};

/// Seeded so the feature is useful before you have saved anything. These are
/// the questions worth asking of almost any thread.
export const DEFAULT_PRESETS: Preset[] = [
  {
    id: "takes",
    label: "Best takes",
    prompt: "What are the most thoughtful takes in this thread?",
  },
  {
    id: "disagreement",
    label: "The disagreement",
    prompt:
      "Where do people genuinely disagree here, and who has the better argument? Quote both sides.",
  },
  {
    id: "surprise",
    label: "What surprised you",
    prompt:
      "What did someone say here that a well-informed reader would not already know? Skip anything obvious.",
  },
  {
    id: "talkingpast",
    label: "Talking past it?",
    prompt:
      "Is this thread engaging with the article's actual claim, or with the headline? State the "
      + "article's central claim, name the comments that take it seriously, name the tangents, "
      + "and give a one-line verdict.",
  },
  {
    id: "wrong",
    label: "What's wrong",
    prompt:
      "What claims in this thread are wrong, unsupported, or would not survive scrutiny? Be specific and cite them.",
  },
];

export function withDefaults(provider: Provider, overrides: ProviderModels): Models {
  return { ...DEFAULT_MODELS[provider], ...(overrides[provider] ?? {}) };
}

/// Earlier versions stored one flat map, which silently sent Claude's model
/// names to Codex. A flat map is read as the Claude choices it always was.
export function readOverrides(raw: unknown): ProviderModels {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const value = raw as Record<string, unknown>;
  if ("claude" in value || "codex" in value) {
    return value as ProviderModels;
  }
  return Object.keys(value).length > 0 ? { claude: value as Partial<Models> } : {};
}

/// Wait before speculatively digesting, so paging through the list with j/k
