import { useMemo } from "react";
import { useApp } from "../state/app";
import { Markdown } from "./Markdown";
import { OutputSkeleton } from "./Skeleton";
import { ErrorState } from "./ErrorState";
import { countWords, mergeSourceRuns, minutes, renderLevel } from "../lib/digest";
import { formatDuration } from "../lib/format";
import type { ReadLevel } from "../lib/types";

/// How many distinct comments the briefing leans on, for the header count.
function countSources(markdown: string) {
  const seen = new Set<number>();
  const pattern = /\]\(hn:([\d,\s]+)\)/g;
  let match = pattern.exec(markdown);
  while (match) {
    for (const part of match[1].split(",")) {
      const id = Number(part.trim());
      if (Number.isFinite(id) && id > 0) {
        seen.add(id);
      }
    }
    match = pattern.exec(markdown);
  }
  return seen.size;
}

const LEVELS: { key: ReadLevel; label: string; hint: string }[] = [
  { key: "gist", label: "Gist", hint: "The opening line and the headings" },
  { key: "skim", label: "Skim", hint: "Each section's point, without the elaboration" },
  { key: "full", label: "Full", hint: "Everything, with the reasoning and the numbers" },
];

export function RundownView() {
  const output = useApp((state) => state.outputs.rundown);
  const coverage = useApp((state) => state.coverage);
  const prefetching = useApp((state) => state.prefetching);
  const runOutput = useApp((state) => state.runOutput);
  const stopOutput = useApp((state) => state.stopOutput);
  const readLevel = useApp((state) => state.readLevel);
  const setReadLevel = useApp((state) => state.setReadLevel);

  const levelled = useMemo(
    () => renderLevel(output.text, readLevel),
    [output.text, readLevel],
  );
  const body = useMemo(() => mergeSourceRuns(levelled), [levelled]);
  const sourceCount = useMemo(() => countSources(levelled), [levelled]);

  // Each level's cost, measured rather than guessed, so the choice is informed.
  const levelTimes = useMemo(() => {
    const at = (level: ReadLevel) => minutes(countWords(renderLevel(output.text, level)));
    return { gist: at("gist"), skim: at("skim"), full: at("full") };
  }, [output.text]);

  const partial = coverage && coverage.included < coverage.total;
  const report = output.report;

  if (!output.text && !output.streaming && !output.error) {
    return (
      <div className="empty-state">
        <h2>What's the story here?</h2>
        <p>
          One account of the subject, merging the article with what the thread knows, in plain
          words. Sources sit in footnotes you can hover, so you only open the thread when you
          want to.
        </p>
        <button type="button" className="primary-button" onClick={() => runOutput("rundown")}>
          Write it up
        </button>
        {partial ? (
          <p className="fine">
            This thread is large. {coverage!.included} of {coverage!.total} comments will be sent,
            chosen by length, replies, and depth.
          </p>
        ) : null}
      </div>
    );
  }

  if (output.error && !output.text) {
    return (
      <ErrorState
        title="That run did not finish"
        message={output.error}
        onRetry={() => runOutput("rundown", true)}
      />
    );
  }

  return (
    <div className="output rundown">
      <div className="output-toolbar">
        {output.streaming ? (
          <>
            <span className="pulse" />
            <span className="muted">
              {prefetching && !output.text ? "Reading ahead…" : "Working through it…"}
            </span>
            <div className="spacer" />
            <button type="button" className="ghost-button" onClick={() => stopOutput("rundown")}>
              Stop
            </button>
          </>
        ) : (
          <>
            <div className="levels">
              {LEVELS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={readLevel === entry.key ? "active" : ""}
                  title={entry.hint}
                  onClick={() => setReadLevel(entry.key)}
                >
                  {entry.label}
                  <span className="level-time">{levelTimes[entry.key]}m</span>
                </button>
              ))}
            </div>
            {sourceCount > 0 ? (
              <span className="muted">{sourceCount} sources</span>
            ) : null}
            {report && report.problems > 0 ? (
              <span className="verify bad">{report.problems} sources not in this thread</span>
            ) : null}
            {output.durationMs ? (
              <>
                <span className="dot">·</span>
                <span className="muted">{formatDuration(output.durationMs)}</span>
              </>
            ) : null}
            <div className="spacer" />
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigator.clipboard.writeText(output.text)}
            >
              Copy
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => runOutput("rundown", true)}
            >
              Rewrite
            </button>
          </>
        )}
      </div>

      {output.error ? (
        <div className="inline-error">
          <span>{output.error}</span>
          <button type="button" onClick={() => runOutput("rundown", true)}>
            Retry
          </button>
        </div>
      ) : null}

      <article className="rundown-body" data-selection-source="rundown">
        {output.streaming && !output.text ? (
          <OutputSkeleton />
        ) : (
          <>
            <Markdown source={body} footnotes />
            {output.streaming ? <span className="caret" /> : null}
            {readLevel !== "full" && !output.streaming ? (
              <p className="level-note">
                Reading the {readLevel}.{" "}
                <button type="button" className="link" onClick={() => setReadLevel("full")}>
                  Show the full briefing
                </button>
              </p>
            ) : null}
          </>
        )}
      </article>

      {!output.streaming && report && report.problems > 0 ? (
        <section className="sources-problem">
          <h2>Unverified sources</h2>
          <p className="fine">
            These ids are not comments in this thread, so any claim resting on them is
            unsupported.
          </p>
          <ul>
            {report.citations
              .filter((citation) => citation.status !== "exact")
              .map((citation) => (
                <li key={citation.commentId}>id {citation.commentId}</li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
