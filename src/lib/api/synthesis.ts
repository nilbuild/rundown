import { invoke } from "@tauri-apps/api/core";

import type { Provider } from "~/lib/api/settings";

export interface SynthesiseArgs {
  runId: string;
  storyIds: number[];
  provider: Provider;
  model?: string | null;
  instruction: string;
  title?: string;
}

export interface Synthesis {
  id: number;
  title: string;
  storyIds: number[];
  markdown: string;
  createdAt: number;
}



export function synthesise(args: SynthesiseArgs) {
  return invoke<void>("synthesise", { args });
}

export function synthesisList() {
  return invoke<Synthesis[]>("synthesis_list");
}

export function synthesisDelete(id: number) {
  return invoke<void>("synthesis_delete", { id });
}
