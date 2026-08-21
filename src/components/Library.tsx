import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { Search } from "lucide-react";
import { useApp } from "../state/app";
import { librarySearch, libraryStats, readingHistory } from "../lib/api";
import { formatDate } from "../lib/format";
import type { HistoryEntry, LibraryHit, LibraryStats } from "../lib/types";

const KIND_LABEL: Record<string, string> = {
  thread: "Comment",
  rundown: "Rundown",
  digest: "Digest",
  brief: "Brief",
  chat: "Chat",
};

/// FTS5 marks matches with <b>. Rendering that as text would show the tags, and
/// rendering it as HTML would trust the corpus, so the marked runs are split out
/// and rebuilt as elements.
function Highlighted(props: { snippet: string }) {
  const parts = useMemo(() => props.snippet.split(/(<b>|<\/b>)/), [props.snippet]);
  let on = false;
  return (
    <>
      {parts.map((part, index) => {
        if (part === "<b>") {
          on = true;
          return null;
        }
        if (part === "</b>") {
          on = false;
          return null;
        }
        if (!part) {
          return null;
        }
        return on ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>;
      })}
    </>
  );
}

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
        <Dialog.Backdrop className="ui-backdrop" />
        <Dialog.Popup className="ui-dialog library">
          <div className="library-search">
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

          <div className="library-results">
            {query.trim().length < 2 ? (
              <>
                <p className="fine library-hint">
                  {stats
                    ? `${stats.entries} pieces across ${stats.stories} stories. Search, or tick two or more to read them together.`
                    : "Everything you have opened is here."}
                </p>

                {byDay.map(([key, entries]) => (
                  <section key={key} className="library-day">
                    <h3>
                      {dayLabel(key)}
                      <span className="muted">
                        {entries.length} {entries.length === 1 ? "story" : "stories"}
                      </span>
                    </h3>
                    {entries.map((entry) => (
                      <div
                        key={entry.storyId}
                        className={`library-row ${picked.has(entry.storyId) ? "picked" : ""}`}
                      >
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={picked.has(entry.storyId)}
                            onChange={() => togglePicked(entry.storyId)}
                          />
                        </label>
                        <button
                          type="button"
                          className="library-row-open"
                          onClick={() => {
                            setOpen(false);
                            selectStory(entry.storyId);
                          }}
                        >
                          <span className="library-row-title">
                            {entry.title || `Story ${entry.storyId}`}
                          </span>
                          {entry.kinds.includes("rundown") ? (
                            <span className="library-flag">briefed</span>
                          ) : null}
                        </button>
                      </div>
                    ))}
                  </section>
                ))}
              </>
            ) : null}

            {query.trim().length >= 2 && hits.length === 0 && !busy ? (
              <p className="fine library-hint">Nothing matches “{query.trim()}”.</p>
            ) : null}

            {hits.map((hit, index) => (
              <button
                key={`${hit.storyId}-${hit.kind}-${index}`}
                type="button"
                className="library-hit"
                onClick={() => openHit(hit)}
              >
                <div className="library-hit-head">
                  <span className="library-kind">{KIND_LABEL[hit.kind] ?? hit.kind}</span>
                  <span className="library-title">{hit.title}</span>
                  <span className="muted">{formatDate(hit.createdAt)}</span>
                </div>
                <p className="library-snippet">
                  <Highlighted snippet={hit.snippet} />
                </p>
              </button>
            ))}
          </div>

          {picked.size > 0 ? (
            <div className="library-foot">
              <span>
                {picked.size} {picked.size === 1 ? "story" : "stories"} picked
              </span>
              <button type="button" className="ghost-button" onClick={() => clearPicked()}>
                Clear
              </button>
              <div className="spacer" />
              <button
                type="button"
                className="primary-button small"
                disabled={picked.size < 2}
                title={picked.size < 2 ? "Pick at least two" : "Read these together"}
                onClick={() => runSynthesis("")}
              >
                Read together
              </button>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
