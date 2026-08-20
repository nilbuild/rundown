import { describe, expect, it, vi, beforeEach } from "vitest";

const handlers = new Map<string, Record<string, (arg: never) => void>>();

vi.mock("../lib/runs", () => ({
  newRunId: () => `run_${handlers.size}`,
  trackRun: (runId: string, next: Record<string, (arg: never) => void>) => {
    handlers.set(runId, next);
    return () => handlers.delete(runId);
  },
  watchRateLimit: () => () => undefined,
}));

vi.mock("../lib/api", () => ({
  generate: vi.fn(async () => undefined),
  cancelRun: vi.fn(async () => true),
  settingsSet: vi.fn(async () => undefined),
  settingsAll: vi.fn(async () => ({})),
  providers: vi.fn(async () => null),
  readIds: vi.fn(async () => []),
  loadFeed: vi.fn(async () => []),
  loadThread: vi.fn(async () => ({ thread: null, newComments: null, lastVisit: null })),
  loadArticle: vi.fn(async () => null),
  searchStories: vi.fn(async () => []),
  coverage: vi.fn(async () => null),
  cachedOutput: vi.fn(async () => null),
  chatHistory: vi.fn(async () => []),
  chatSend: vi.fn(async () => undefined),
  chatClear: vi.fn(async () => undefined),
  takeList: vi.fn(async () => []),
}));

const { useApp } = await import("./app");

function blankOutput() {
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

describe("a run does not bleed into the next story", () => {
  beforeEach(() => {
    handlers.clear();
    // runOutput refuses to start while a run is already streaming, so each
    // test needs a clean slate rather than the last one's in-flight run.
    useApp.setState({
      selectedId: 1,
      outputs: {
        rundown: blankOutput(),
        digest: blankOutput(),
        brief: blankOutput(),
      },
    });
  });

  it("drops deltas that arrive after you have moved on", async () => {
    await useApp.getState().runOutput("digest");
    const runId = useApp.getState().outputs.digest.runId!;

    handlers.get(runId)!.onDelta("text for story one" as never);
    expect(useApp.getState().outputs.digest.text).toBe("text for story one");

    // The reader opens a different story while that run is still in flight.
    useApp.setState({ selectedId: 2, outputs: { ...useApp.getState().outputs } });

    handlers.get(runId)!.onDelta(" — and more" as never);
    expect(useApp.getState().outputs.digest.text).toBe("text for story one");
  });

  it("drops the terminal event too", async () => {
    await useApp.getState().runOutput("digest");
    const runId = useApp.getState().outputs.digest.runId!;

    useApp.setState({ selectedId: 2 });
    handlers.get(runId)!.onDone({
      text: "a whole digest for the wrong story",
      durationMs: 10,
      costUsd: null,
      report: null,
    } as never);

    expect(useApp.getState().outputs.digest.text).not.toContain("wrong story");
  });
});
