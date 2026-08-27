import "./output-view.css";

import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { formatDuration } from "~/utils/format";
import { OutputSkeleton } from "~/components/ui/skeleton";
import { Tooltip } from "~/components/ui/tooltip";
import { DigestReader } from "~/components/digest/digest-reader";
import { ErrorState } from "~/components/ui/error-state";
import type { OutputKind, VerifyReport } from "~/types";
import { Menu } from "~/components/ui/menu";
import { ChevronDown } from "lucide-react";
import { toPlainMarkdown, toPortableMarkdown } from "~/utils/export";

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
      <div className="empty-state">
        <h2>{emptyTitle}</h2>
        <p>{emptyBody}</p>
        <button type="button" className="primary-button" onClick={() => runOutput(kind)}>
          {actionLabel}
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
        onRetry={() => runOutput(kind, true)}
      />
    );
  }

  return (
    <div className="output">
      <div className="output-toolbar">
        {output.streaming ? (
          <>
            <span className="pulse" />
            <span className="muted">
              {prefetching && !output.text ? "Reading ahead…" : "Reading the thread…"}
            </span>
            <div className="spacer" />
            <button type="button" className="ghost-button" onClick={() => stopOutput(kind)}>
              Stop
            </button>
          </>
        ) : (
          <>
            {report ? (
              <Tooltip label={verifyDetail(report)}>
                <span className={`verify ${report.problems > 0 ? "bad" : "good"}`}>
                  {report.problems > 0
                    ? `${report.problems} of ${report.citations.length} quotes unverified`
                    : `${report.citations.length} quotes verified`}
                  {report.loose > 0 && report.problems === 0 ? ` · ${report.loose} shortened` : ""}
                </span>
              </Tooltip>
            ) : null}
            {output.fromCache ? <span className="muted">saved</span> : null}
            {output.durationMs ? (
              <span className="muted">{formatDuration(output.durationMs)}</span>
            ) : null}
            <div className="spacer" />
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
            <button type="button" className="ghost-button" onClick={() => runOutput(kind, true)}>
              Regenerate
            </button>
          </>
        )}
      </div>

      {output.error ? (
        <div className="inline-error">
          <span>{output.error}</span>
          <button type="button" onClick={() => runOutput(kind, true)}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="output-body" data-selection-source={kind}>
        {output.streaming && !output.text ? (
          <OutputSkeleton />
        ) : kind === "digest" ? (
          <>
            <DigestReader
              markdown={output.text}
              citations={report?.citations}
              streaming={output.streaming}
            />
            {output.streaming ? <span className="caret" /> : null}
          </>
        ) : (
          <>
            <Markdown
              source={output.text}
              citations={report?.citations}
              onJump={(commentId) => jumpToComment(commentId)}
            />
            {output.streaming ? <span className="caret" /> : null}
          </>
        )}
      </div>
    </div>
  );
}
