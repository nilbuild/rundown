import { create } from "zustand";
import * as api from "~/lib/api";
import { watchRateLimit } from "~/lib/runs";
import { createFeedSlice } from "./feed";
import { createThreadSlice } from "./thread";
import { createCommentsSlice } from "./comments";
import { createOutputsSlice } from "./outputs";
import { createChatSlice } from "./chat";
import { createUiSlice } from "./ui";
import { createSynthesisSlice } from "./synthesis";
import { createSettingsSlice } from "./settings";
import type { PrefetchMode, Preset, Provider, ReadLevel } from "~/types";
import { DEFAULT_PRESETS, readOverrides, withDefaults } from "./settings";
import type { AppState } from "./types";

export type { Tab, View, OutputState } from "./types";

export const useApp = create<AppState>()((set, get, store) => ({
  ...createFeedSlice(set, get, store),
  ...createThreadSlice(set, get, store),
  ...createCommentsSlice(set, get, store),
  ...createOutputsSlice(set, get, store),
  ...createChatSlice(set, get, store),
  ...createUiSlice(set, get, store),
  ...createSynthesisSlice(set, get, store),
  ...createSettingsSlice(set, get, store),

  bootstrap: async () => {
    watchRateLimit((rateLimit) => set({ rateLimit }));

    const [settings, status, seen] = await Promise.all([
      api.settingsAll().catch(() => ({}) as Record<string, unknown>),
      api.providers().catch(() => null),
      api.readIds().catch(() => [] as number[]),
    ]);

    const provider = (settings.provider as Provider) ?? "claude";
    const stored = readOverrides(settings.models);
    set({
      provider,
      modelOverrides: stored,
      models: withDefaults(provider, stored),
      // The setting used to be a boolean; keep old installs working.
      prefetch:
        typeof settings.prefetch === "string"
          ? (settings.prefetch as PrefetchMode)
          : settings.prefetch === false
            ? "off"
            : "rundown",
      readLevel: (settings.readLevel as ReadLevel) ?? "skim",
      presets: Array.isArray(settings.presets)
        ? (settings.presets as Preset[])
        : DEFAULT_PRESETS,
      providerStatus: status,
      readIds: new Set(seen),
    });

    api
      .availableModels(provider)
      .then((modelOptions) => set({ modelOptions }))
      .catch(() => undefined);

    api
      .resolveModels(provider)
      .then((modelResolved) => set({ modelResolved }))
      .catch(() => undefined);

    await get().refreshFeed();
  },
}));
