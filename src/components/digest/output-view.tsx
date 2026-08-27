import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { formatDuration } from "~/utils/format";
import { OutputSkeleton } from "~/components/ui/output-skeleton";
import { Tooltip } from "~/components/ui/tooltip";
import { DigestReader } from "~/components/digest/digest-reader";
import { ErrorState } from "~/components/ui/error-state";
import { InlineError } from "~/components/ui/inline-error";
import type { OutputKind, VerifyReport } from "~/lib/api/outputs";
import { Menu } from "~/components/ui/menu";
import { ChevronDown } from "lucide-react";
import { toPlainMarkdown, toPortableMarkdown } from "~/utils/export";
import { GhostButton } from "~/components/ui/ghost-button";
import { PrimaryButton } from "~/components/ui/primary-button";
import { cn } from "~/utils/classname";

interface Props {
  kind: OutputKind;
  emptyTitle: string;
  emptyBody: string;
  actionLabel: string;
}

/// What the badge says on hover. When something failed, name the specific
/// quotes rather than making the reader hunt for the red one.
function verifyDetail(report: VerifyReport) {
  if (report.problems === 0) {
    return report.loose > 0
      ? `Every quote was found in the comment it cites. ${report.loose} were shortened or reflowed.`
      : "Every quote was found, word for word, in the comment it cites.";
  }

  const lines = report.citations
    .filter((citation) => citation.status !== "exact" && citation.status !== "loose")
    .map((citation) => {
      if (citation.status === "unknown") {
        return `@${citation.claimedAuthor}: no comment with id ${citation.commentId} in this thread`;
      }
      if (citation.status === "wrongauthor") {
        return `@${citation.claimedAuthor}: the quote is real but @${
          citation.actualAuthor ?? "someone else"
        } wrote it`;
      }
      return `@${citation.claimedAuthor}: that comment does not contain the quote`;
    });

  return `Check these before you use them —\n${lines.join("\n")}`;
}

export function OutputView(props: Props) {
  const { kind, emptyTitle, emptyBody, actionLabel } = props;

  const output = useApp((state) => state.outputs[kind]);
  const coverage = useApp((state) => state.coverage);
  const runOutput = useApp((state) => state.runOutput);
  const stopOutput = useApp((state) => state.stopOutput);
  const jumpToComment = useApp((state) => state.jumpToComment);
  const prefetching = useApp((state) => state.prefetching);

  const report = output.report;
  const partial = coverage && coverage.included < coverage.total;

  if (!output.text && !output.streaming && !output.error) {
    return (
      <div className="mx-auto max-w-[440px] px-8 py-[90px] text-center [&_h2]:mb-2 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-semibold [&_h2]:tracking-[-0.015em] [&_p]:mb-5 [&_p]:text-[13.5px] [&_p]:leading-[1.6] [&_p]:text-muted">
        <h2>{emptyTitle}</h2>
        <p>{emptyBody}</p>
        <PrimaryButton onClick={() => runOutput(kind)}>
          {actionLabel}
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
        onRetry={() => runOutput(kind, true)}
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
              {prefetching && !output.text ? "Reading ahead…" : "Reading the thread…"}
            </span>
            <div className="flex-1" />
            <GhostButton onClick={() => stopOutput(kind)}>
              Stop
            </GhostButton>
          </>
        ) : (
          <>
            {report ? (
              <Tooltip label={verifyDetail(report)}>
                <span className={cn(
                    "cursor-default rounded-full px-2 py-0.5 text-[11.5px] font-[550]",
                    report.problems > 0
                      ? "bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] text-bad"
                      : "bg-[color-mix(in_srgb,var(--good)_12%,transparent)] text-good",
                  )}>
                  {report.problems > 0
                    ? `${report.problems} of ${report.citations.length} quotes unverified`
                    : `${report.citations.length} quotes verified`}
                  {report.loose > 0 && report.problems === 0 ? ` · ${report.loose} shortened` : ""}
                </span>
              </Tooltip>
            ) : null}
            {output.fromCache ? <span className="text-muted">saved</span> : null}
            {output.durationMs ? (
              <span className="text-muted">{formatDuration(output.durationMs)}</span>
            ) : null}
            <div className="flex-1" />
            <Menu
              ariaLabel="Copy this digest"
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
            <GhostButton onClick={() => runOutput(kind, true)}>
              Regenerate
            </GhostButton>
          </>
        )}
      </div>

      {output.error ? (
        <InlineError message={output.error} onRetry={() => runOutput(kind, true)} />
      ) : null}

      <div className="pt-2 text-[14.5px] leading-[1.65] [&_.md_h2]:mt-[1.9em] [&_.md_h2]:mb-[0.7em] [&_.md_h2]:pb-0 [&_.md_h2]:text-base [&_.md_h2]:tracking-[-0.01em] [&_.md_h2:first-child]:mt-0 [&_.md_blockquote]:my-[0.9em] [&_.md_blockquote]:mb-[0.5em] [&_.md_blockquote]:border-l-2 [&_.md_blockquote]:border-accent [&_.md_blockquote]:py-0.5 [&_.md_blockquote]:pl-4 [&_.md_blockquote]:font-serif [&_.md_blockquote]:text-[15.5px] [&_.md_blockquote]:leading-[1.55] [&_.md_blockquote]:text-fg [&_.md_blockquote_p]:m-0 [&_.md_em]:text-muted" data-selection-source={kind}>
        {output.streaming && !output.text ? (
          <OutputSkeleton />
        ) : kind === "digest" ? (
          <>
            <DigestReader
              markdown={output.text}
              citations={report?.citations}
              streaming={output.streaming}
            />
            {output.streaming ? <span className="ml-0.5 inline-block h-[15px] w-[7px] bg-accent align-text-bottom animate-caret" /> : null}
          </>
        ) : (
          <>
            <Markdown
              source={output.text}
              citations={report?.citations}
              onJump={(commentId) => jumpToComment(commentId)}
            />
            {output.streaming ? <span className="ml-0.5 inline-block h-[15px] w-[7px] bg-accent align-text-bottom animate-caret" /> : null}
          </>
        )}
      </div>
    </div>
  );
}
