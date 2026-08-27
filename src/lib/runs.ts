import { listen } from "@tauri-apps/api/event";
import type { Provider, RateLimit } from "~/lib/api/settings";
import type { VerifyReport } from "~/lib/api/outputs";

export type AiEvent =
  | {
      kind: "started";
      runId: string;
      provider: Provider;
      model: string | null;
      sessionId: string | null;
    }
  | { kind: "delta"; runId: string; text: string }
  | {
      kind: "rateLimit";
      runId: string;
      status: string;
      window: string | null;
      resetsAt: number | null;
    }
  | {
      kind: "done";
      runId: string;
      text: string;
      sessionId: string | null;
      durationMs: number;
      costUsd: number | null;
      report: VerifyReport | null;
    }
  | { kind: "error"; runId: string; message: string };

export interface RunHandlers {
  onStart?: (model: string | null) => void;
  onDelta?: (text: string) => void;
  onDone?: (payload: {
    text: string;
    durationMs: number;
    costUsd: number | null;
    report: VerifyReport | null;
  }) => void;
  onError?: (message: string) => void;
}

const handlers = new Map<string, RunHandlers>();
const rateLimitWatchers = new Set<(limit: RateLimit) => void>();
let installed = false;

function install() {
  if (installed) {
    return;
  }
  installed = true;

  listen<AiEvent>("ai://event", (event) => {
    const payload = event.payload;
    if (payload.kind === "rateLimit") {
      const limit: RateLimit = {
        status: payload.status,
        window: payload.window,
        resetsAt: payload.resetsAt,
      };
      rateLimitWatchers.forEach((watcher) => watcher(limit));
      return;
    }

    const handler = handlers.get(payload.runId);
    if (!handler) {
      return;
    }

    if (payload.kind === "started") {
      handler.onStart?.(payload.model);
      return;
    }
    if (payload.kind === "delta") {
      handler.onDelta?.(payload.text);
      return;
    }
    if (payload.kind === "done") {
      handlers.delete(payload.runId);
      handler.onDone?.({
        text: payload.text,
        durationMs: payload.durationMs,
        costUsd: payload.costUsd,
        report: payload.report,
      });
      return;
    }
    if (payload.kind === "error") {
      handlers.delete(payload.runId);
      handler.onError?.(payload.message);
    }
  });
}

export function newRunId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function trackRun(runId: string, next: RunHandlers) {
  install();
  handlers.set(runId, next);
  return () => {
    handlers.delete(runId);
  };
}

export function watchRateLimit(watcher: (limit: RateLimit) => void) {
  install();
  rateLimitWatchers.add(watcher);
  return () => {
    rateLimitWatchers.delete(watcher);
  };
}
