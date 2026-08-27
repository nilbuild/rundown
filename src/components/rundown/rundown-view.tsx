import { useMemo } from "react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { OutputSkeleton } from "~/components/ui/output-skeleton";
import { ErrorState } from "~/components/ui/error-state";
import { InlineError } from "~/components/ui/inline-error";
import { Tooltip } from "~/components/ui/tooltip";
import { countWords, mergeSourceRuns, minutes, renderLevel } from "~/utils/digest";
import { formatDuration } from "~/utils/format";
import type { ReadLevel } from "~/lib/api/settings";
import { Menu } from "~/components/ui/menu";
import { ChevronDown } from "lucide-react";
import { toPlainMarkdown, toPortableMarkdown } from "~/utils/export";
import { GhostButton } from "~/components/ui/ghost-button";
import { LinkButton } from "~/components/ui/link-button";
import { PrimaryButton } from "~/components/ui/primary-button";
import { cn } from "~/utils/classname";

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
  const thread = useApp((state) => state.thread);
  const coverage = useApp((state) => state.coverage);
  const prefetching = useApp((state) => state.prefetching);
  const prefetchPending = useApp((state) => state.prefetchPending);
  const runOutput = useApp((state) => state.runOutput);
  const stopOutput = useApp((state) => state.stopOutput);
  const readLevel = useApp((state) => state.readLevel);
  const setReadLevel = useApp((state) => state.setReadLevel);

  const levelled = useMemo(
    () => renderLevel(output.text, readLevel),
    [output.text, readLevel],
  );
  const body = useMemo(() => mergeSourceRuns(levelled), [levelled]);
  const sourceCount = useMemo(() => countSources(output.text), [output.text]);

  // Each level's cost, measured rather than guessed, so the choice is informed.
  const levelTimes = useMemo(() => {
    const at = (level: ReadLevel) => minutes(countWords(renderLevel(output.text, level)));
    return { gist: at("gist"), skim: at("skim"), full: at("full") };
  }, [output.text]);

  const partial = coverage && coverage.included < coverage.total;
  const report = output.report;

  // A run is already scheduled, so offering a button to start one reads as
  // though nothing is going to happen.
  if (!output.text && !output.streaming && !output.error && prefetchPending) {
    return (
      <div className="mx-auto max-w-[720px] px-8 pb-[120px]">
        <div className="sticky top-0 z-2 flex items-center gap-2.5 bg-panel pt-3 pb-3.5 text-xs">
          <span className="size-[7px] shrink-0 rounded-full bg-accent animate-pulse-dot" />
          <span className="text-muted">Starting the briefing…</span>
          <div className="flex-1" />
          <GhostButton
           
           
            onClick={() => runOutput("rundown", true)}
          >
            Start now
          </GhostButton>
        </div>
        <article className="max-w-[640px] pt-1.5 [&_.md]:text-[15px] [&_.md]:leading-[1.68] [&_.md]:text-fg-soft [&_.md>p:first-child]:mb-[1.4em] [&_.md>p:first-child]:text-[17px] [&_.md>p:first-child]:leading-[1.55] [&_.md>p:first-child]:text-fg [&_.md_h2]:mt-[2em] [&_.md_h2]:mb-[0.65em] [&_.md_h2]:text-[15.5px] [&_.md_h2]:font-[620] [&_.md_h2]:tracking-[-0.008em] [&_.md_h2]:text-fg [&_.md_h2:first-child]:mt-0 [&_.md_li]:mb-[0.45em]">
          <OutputSkeleton />
        </article>
      </div>
    );
  }

  if (!output.text && !output.streaming && !output.error) {
    return (
      <div className="mx-auto max-w-[440px] px-8 py-[90px] text-center [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_p]:mb-5 [&_p]:text-[13.5px] [&_p]:leading-[1.6] [&_p]:text-muted">
        <h2>What's the story here?</h2>
        <p>
          One account of the subject, merging the article with what the thread knows, in plain
          words. Each claim carries a small marker — hover it to read the comment behind the
          claim, so you only open the thread when you want to.
        </p>
        <PrimaryButton onClick={() => runOutput("rundown")}>
          Write it up
        </PrimaryButton>
        {partial ? (
          <p className="text-xs leading-[1.5] text-muted">
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
    <div className="mx-auto max-w-[720px] px-8 pb-[120px]">
      <div className="sticky top-0 z-2 flex items-center gap-2.5 bg-panel pt-3 pb-3.5 text-xs">
        {output.streaming ? (
          <>
            <span className="size-[7px] shrink-0 rounded-full bg-accent animate-pulse-dot" />
            <span className="text-muted">
              {prefetching && !output.text ? "Reading ahead…" : "Working through it…"}
            </span>
            <div className="flex-1" />
            <GhostButton onClick={() => stopOutput("rundown")}>
              Stop
            </GhostButton>
          </>
        ) : (
          <>
            <div className="inline-flex gap-px rounded-lg bg-line-soft p-0.5">
              {LEVELS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={cn(
                    "inline-flex items-baseline gap-[5px] rounded-md px-2.5 py-[3px] text-[11.5px] text-muted transition-[background,color] duration-[120ms]",
                    readLevel === entry.key
                      ? "bg-panel font-semibold text-fg shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                      : "hover:text-fg",
                  )}
                  title={entry.hint}
                  onClick={() => setReadLevel(entry.key)}
                >
                  {entry.label}
                  <span className="text-[10.5px] tabular-nums opacity-70">{levelTimes[entry.key]}m</span>
                </button>
              ))}
            </div>
            {sourceCount > 0 ? (
              <Tooltip
                label={
                  thread
                    ? `This briefing draws on ${sourceCount} of the thread's ${thread.comment_count} comments. Point at a marker to read one.`
                    : "Point at a marker to read the comment behind a claim."
                }
              >
                <span className="cursor-default border-b border-dotted border-line text-muted">
                  cites {sourceCount} {sourceCount === 1 ? "comment" : "comments"}
                </span>
              </Tooltip>
            ) : null}
            {report && report.problems > 0 ? (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] px-2 py-0.5 text-[11.5px] font-[550] text-bad">{report.problems} sources not in this thread</span>
            ) : null}
            {output.durationMs ? (
              <>
                <span className="opacity-50">·</span>
                <span className="text-muted">{formatDuration(output.durationMs)}</span>
              </>
            ) : null}
            <div className="flex-1" />
            <Menu
              ariaLabel="Copy this briefing"
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
                  hint: "Markdown, with each source pointing at its comment on Hacker News",
                  onSelect: () =>
                    navigator.clipboard.writeText(toPortableMarkdown(output.text)),
                },
                {
                  id: "plain",
                  label: "Copy without sources",
                  hint: "Just the prose, for pasting into a draft",
                  onSelect: () => navigator.clipboard.writeText(toPlainMarkdown(output.text)),
                },
              ]}
            />
            <GhostButton
             
             
              onClick={() => runOutput("rundown", true)}
            >
              Rewrite
            </GhostButton>
          </>
        )}
      </div>

      {output.error ? (
        <InlineError message={output.error} onRetry={() => runOutput("rundown", true)} />
      ) : null}

      <article className="max-w-[640px] pt-1.5 [&_.md]:text-[15px] [&_.md]:leading-[1.68] [&_.md]:text-fg-soft [&_.md>p:first-child]:mb-[1.4em] [&_.md>p:first-child]:text-[17px] [&_.md>p:first-child]:leading-[1.55] [&_.md>p:first-child]:text-fg [&_.md_h2]:mt-[2em] [&_.md_h2]:mb-[0.65em] [&_.md_h2]:text-[15.5px] [&_.md_h2]:font-[620] [&_.md_h2]:tracking-[-0.008em] [&_.md_h2]:text-fg [&_.md_h2:first-child]:mt-0 [&_.md_li]:mb-[0.45em]" data-selection-source="rundown">
        {output.streaming && !output.text ? (
          <OutputSkeleton />
        ) : (
          <>
            <Markdown source={body} footnotes />
            {output.streaming ? <span className="ml-0.5 inline-block h-[15px] w-[7px] bg-accent align-text-bottom animate-caret" /> : null}
            {readLevel !== "full" && !output.streaming ? (
              <p className="mt-[18px] mb-0 text-xs text-muted">
                Reading the {readLevel}.{" "}
                <LinkButton onClick={() => setReadLevel("full")}>
                  Show the full briefing
                </LinkButton>
              </p>
            ) : null}
          </>
        )}
      </article>

      {!output.streaming && report && report.problems > 0 ? (
        <section className="mt-10 max-w-[640px] rounded-[10px] border border-bad bg-[color-mix(in_srgb,var(--bad)_7%,transparent)] px-4 py-3.5 [&>h2]:mb-1.5 [&>h2]:text-xs [&>h2]:font-semibold [&>h2]:text-bad [&_ul]:mt-2 [&_ul]:pl-[18px] [&_ul]:text-xs [&_ul]:text-bad">
          <h2>Unverified sources</h2>
          <p className="text-xs leading-[1.5] text-muted">
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
