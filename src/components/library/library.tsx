import { Highlighted } from "~/components/library/highlighted";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { Search } from "lucide-react";
import { useApp } from "~/stores/app";
import { librarySearch, libraryStats, readingHistory } from "~/lib/api/library";
import { formatDate } from "~/utils/format";
import type { HistoryEntry, LibraryHit, LibraryStats } from "~/lib/api/library";
import { GhostButton } from "~/components/ui/ghost-button";
import { PrimaryButton } from "~/components/ui/primary-button";
import { cn } from "~/utils/classname";

const KIND_LABEL: Record<string, string> = {
  thread: "Comment",
  rundown: "Briefing",
  digest: "Digest",
  brief: "Brief",
  chat: "Chat",
};


export function Library() {
  const open = useApp((state) => state.libraryOpen);
  const setOpen = useApp((state) => state.setLibraryOpen);
  const selectStory = useApp((state) => state.selectStory);
  const setTab = useApp((state) => state.setTab);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LibraryHit[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const picked = useApp((state) => state.picked);
  const togglePicked = useApp((state) => state.togglePicked);
  const clearPicked = useApp((state) => state.clearPicked);
  const runSynthesis = useApp((state) => state.runSynthesis);

  useEffect(() => {
    if (!open) {
      return;
    }
    libraryStats().then(setStats).catch(() => undefined);
    readingHistory().then(setHistory).catch(() => undefined);
    window.setTimeout(() => inputRef.current?.select(), 20);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    setBusy(true);
    const timer = window.setTimeout(() => {
      librarySearch(query)
        .then(setHits)
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const byDay = useMemo(() => {
    const groups = new Map<string, HistoryEntry[]>();
    for (const entry of history) {
      const when = new Date(entry.readAt * 1000);
      const key = when.toDateString();
      const bucket = groups.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }
    return Array.from(groups.entries());
  }, [history]);

  const dayLabel = (key: string) => {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86_400_000).toDateString();
    if (key === today) {
      return "Today";
    }
    if (key === yesterday) {
      return "Yesterday";
    }
    return new Date(key).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const openHit = (hit: LibraryHit) => {
    setOpen(false);
    selectStory(hit.storyId);
    if (hit.kind === "rundown" || hit.kind === "digest") {
      setTab(hit.kind);
    } else if (hit.kind === "thread") {
      setTab("comments");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[260] bg-black/30 backdrop-blur-[2px] transition-opacity duration-[160ms] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-[270] flex max-h-[70vh] w-[620px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-panel outline-none transition-[opacity,transform] duration-[160ms] data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[starting-style]:scale-97 data-[starting-style]:opacity-0">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-[18px] py-3.5 text-muted [&_input]:flex-1 [&_input]:border-none [&_input]:bg-transparent [&_input]:text-sm [&_input]:outline-none">
            <Search size={14} strokeWidth={2} />
            <input
              ref={inputRef}
              value={query}
              placeholder="Search everything you have read"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="overflow-y-auto p-1.5">
            {query.trim().length < 2 ? (
              <>
                <p className="m-0 px-3.5 py-[18px] text-xs leading-[1.55] text-muted">
                  {stats
                    ? `${stats.entries} pieces across ${stats.stories} stories. Search, or tick two or more to read them together.`
                    : "Everything you have opened is here."}
                </p>

                {byDay.map(([key, entries]) => (
                  <section key={key} className="pt-1 pb-2.5">
                    <h3 className="mt-2.5 mb-1 flex items-baseline gap-2 px-3 text-[11px] font-[650] tracking-[0.05em] text-muted uppercase [&_.text-muted]:text-[11px] [&_.text-muted]:font-normal [&_.text-muted]:tracking-normal [&_.text-muted]:normal-case">
                      {dayLabel(key)}
                      <span className="text-muted">
                        {entries.length} {entries.length === 1 ? "story" : "stories"}
                      </span>
                    </h3>
                    {entries.map((entry) => (
                      <div
                        key={entry.storyId}
                        className={cn(
                          "flex items-center gap-2 rounded-[7px] py-0.5 pr-3 pl-2.5 hover:bg-line-soft",
                          picked.has(entry.storyId) && "bg-accent-soft",
                        )}
                      >
                        <label className="flex shrink-0 items-center">
                          <input
                            type="checkbox"
                            checked={picked.has(entry.storyId)}
                            onChange={() => togglePicked(entry.storyId)}
                          />
                        </label>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-baseline gap-2 py-1.5 text-left"
                          onClick={() => {
                            setOpen(false);
                            selectStory(entry.storyId);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {entry.title || `Story ${entry.storyId}`}
                          </span>
                          {entry.kinds.includes("rundown") ? (
                            <span className="shrink-0 rounded bg-line-soft px-1.5 text-[10px] leading-[15px] text-muted">briefed</span>
                          ) : null}
                        </button>
                      </div>
                    ))}
                  </section>
                ))}
              </>
            ) : null}

            {query.trim().length >= 2 && hits.length === 0 && !busy ? (
              <p className="m-0 px-3.5 py-[18px] text-xs leading-[1.55] text-muted">Nothing matches “{query.trim()}”.</p>
            ) : null}

            {hits.map((hit, index) => (
              <button
                key={`${hit.storyId}-${hit.kind}-${index}`}
                type="button"
                className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-line-soft"
                onClick={() => openHit(hit)}
              >
                <div className="mb-1 flex items-baseline gap-2 text-[11.5px]">
                  <span className="shrink-0 rounded-[5px] bg-accent-soft px-[7px] py-px text-[10px] font-[650] tracking-[0.03em] text-accent uppercase">{KIND_LABEL[hit.kind] ?? hit.kind}</span>
                  <span className="min-w-0 flex-1 truncate font-[550] text-fg">{hit.title}</span>
                  <span className="text-muted">{formatDate(hit.createdAt)}</span>
                </div>
                <p className="m-0 text-[12.5px] leading-[1.55] text-muted [&_mark]:bg-transparent [&_mark]:font-semibold [&_mark]:text-accent">
                  <Highlighted snippet={hit.snippet} />
                </p>
              </button>
            ))}
          </div>

          {picked.size > 0 ? (
            <div className="flex shrink-0 items-center gap-2.5 border-t border-line px-3.5 py-2.5 text-xs text-muted">
              <span>
                {picked.size} {picked.size === 1 ? "story" : "stories"} picked
              </span>
              <GhostButton onClick={() => clearPicked()}>
                Clear
              </GhostButton>
              <div className="flex-1" />
              <PrimaryButton
                small
                disabled={picked.size < 2}
                title={picked.size < 2 ? "Pick at least two" : "Read these together"}
                onClick={() => runSynthesis("")}
              >
                Read together
              </PrimaryButton>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
