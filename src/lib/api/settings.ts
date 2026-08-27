import { invoke } from "@tauri-apps/api/core";

export type Provider = "claude" | "codex";

export type ModelSlot = "rundown" | "digest" | "brief" | "chat";

export type ReadLevel = "gist" | "skim" | "full";

export type PrefetchMode = "off" | "rundown" | "both";

export interface Preset {
  id: string;
  label: string;
  prompt: string;
}

export type Models = Record<ModelSlot, string | null>;

/// Model names belong to one provider. Claude's `opus` means nothing to Codex,
/// so choices are kept apart rather than shared.
export type ProviderModels = Partial<Record<Provider, Partial<Models>>>;

export interface ModelOption {
  value: string;
  label: string;
  hint?: string;
}

export interface ProviderStatus {
  claude: string | null;
  codex: string | null;
}

export interface RateLimit {
  status: string;
  window: string | null;
  resetsAt: number | null;
}

export function settingsAll() {
  return invoke<Record<string, unknown>>("settings_all");
}

export function settingsSet(key: string, value: unknown) {
  return invoke<void>("settings_set", { key, value });
}

export function availableModels(provider: Provider) {
  return invoke<ModelOption[]>("available_models", { provider });
}

/// Slow the first time (it starts the CLI once per alias) and instant after,
/// so callers should fire it and let the answer land rather than await it
/// before drawing.
export function resolveModels(provider: Provider) {
  return invoke<Record<string, string>>("resolve_models", { provider });
}

export function providers() {
  return invoke<ProviderStatus>("providers");
}

export function dataLocation() {
  return invoke<string>("data_location");
}
