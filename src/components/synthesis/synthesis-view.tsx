import "./synthesis-view.css";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { OutputSkeleton } from "~/components/ui/skeleton";
import { ErrorState } from "~/components/ui/error-state";
import { Menu } from "~/components/ui/menu";
import { ChevronDown } from "lucide-react";
import { toPlainMarkdown, toPortableMarkdown } from "~/utils/export";
import { countWords, minutes } from "~/utils/digest";
import { formatDate } from "~/utils/format";

export function SynthesisView() {
  const text = useApp((state) => state.synthesisText);
  const busy = useApp((state) => state.synthesisBusy);
  const error = useApp((state) => state.synthesisError);
  const syntheses = useApp((state) => state.syntheses);
  const active = useApp((state) => state.activeSynthesis);
  const picked = useApp((state) => state.picked);

  const setView = useApp((state) => state.setView);
  const stopSynthesis = useApp((state) => state.stopSynthesis);
  const runSynthesis = useApp((state) => state.runSynthesis);
  const loadSyntheses = useApp((state) => state.loadSyntheses);
  const openSynthesis = useApp((state) => state.openSynthesis);
  const removeSynthesis = useApp((state) => state.removeSynthesis);
  const setLibraryOpen = useApp((state) => state.setLibraryOpen);

  const [instruction, setInstruction] = useState("");

  useEffect(() => {
    loadSyntheses();
  }, [loadSyntheses]);

  return (
    <main className="reader synthesis">
      <header className="reader-head" data-tauri-drag-region>
        <h1 data-tauri-drag-region>Read together</h1>
        <div className="reader-meta" data-tauri-drag-region>
          <span data-tauri-drag-region>
            What several threads add up to, rather than what each one said
          </span>
          <button type="button" className="link" onClick={() => setView("reader")}>
            Back to reading
          </button>
        </div>
      </header>

      <div className="reader-scroll">
        <div className="output synthesis-body">
          <div className="output-toolbar">
            {busy ? (
              <>
                <span className="pulse" />
                <span className="muted">Looking for the connections…</span>
                <div className="spacer" />
                <button type="button" className="ghost-button" onClick={() => stopSynthesis()}>
                  Stop
                </button>
              </>
            ) : text ? (
              <>
                <span className="muted">{minutes(countWords(text))} min read</span>
                <div className="spacer" />
                <Menu
                  ariaLabel="Copy this piece"
                  side="bottom"
                  align="end"
                  trigger={
                    <>
                      Copy
                      <ChevronDown size={11} strokeWidth={2} />
                    </>
                  }
                  entries={[
                    {
                      id: "links",
                      label: "Copy with links",
                      hint: "Markdown, with each story linked to Hacker News",
                      onSelect: () => navigator.clipboard.writeText(toPortableMarkdown(text)),
                    },
                    {
                      id: "plain",
                      label: "Copy without sources",
                      hint: "Just the prose, for pasting into a draft",
                      onSelect: () => navigator.clipboard.writeText(toPlainMarkdown(text)),
                    },
                  ]}
                />
              </>
            ) : null}
          </div>

          {error && !text ? (
            <ErrorState
              title="That run did not finish"
              message={error}
              onRetry={() => runSynthesis(instruction)}
              secondary={{ label: "Pick stories", onClick: () => setLibraryOpen(true) }}
            />
          ) : null}

          {busy && !text ? <OutputSkeleton /> : null}

          {text ? (
            <article className="rundown-body" data-selection-source="synthesis">
              <Markdown source={text} />
              {busy ? <span className="caret" /> : null}
            </article>
          ) : null}

          {!text && !busy && !error ? (
            <div className="empty-state">
              <h2>Read several threads at once</h2>
              <p>
                Pick two or more stories in the Library and this finds what they have in common,
                where they contradict each other, and the question none of them answers.
              </p>
              <button
                type="button"
                className="primary-button"
                onClick={() => setLibraryOpen(true)}
              >
                Pick stories
              </button>
            </div>
          ) : null}

          {!busy && picked.size >= 2 ? (
            <div className="synthesis-again">
              <input
                type="text"
                value={instruction}
                placeholder="Optional: an angle to look for"
                autoComplete="off"
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    runSynthesis(instruction);
                  }
                }}
              />
              <button
                type="button"
                className="ghost-button"
                onClick={() => runSynthesis(instruction)}
              >
                {text ? "Try another angle" : `Read ${picked.size} together`}
              </button>
            </div>
          ) : null}

          {syntheses.length > 0 ? (
            <section className="synthesis-past">
              <h2>Earlier</h2>
              <ul>
                {syntheses.map((entry) => (
                  <li key={entry.id} className={active === entry.id ? "active" : ""}>
                    <button
                      type="button"
                      className="synthesis-past-open"
                      onClick={() => openSynthesis(entry.id)}
                    >
                      <span className="synthesis-past-title">{entry.title}</span>
                      <span className="muted">
                        {entry.storyIds.length} stories · {formatDate(entry.createdAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Delete"
                      onClick={() => removeSynthesis(entry.id)}
                    >
                      <Trash2 size={12} strokeWidth={2} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
