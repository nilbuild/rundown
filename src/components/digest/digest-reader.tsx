import "./digest-reader.css";

import { useMemo, useState } from "react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { Tooltip } from "~/components/ui/tooltip";
import { countWords, minutes, parseDigest, verdictLabel } from "~/utils/digest";
import type { Citation } from "~/types";
import { ChevronDown } from "lucide-react";

interface Props {
  markdown: string;
  citations?: Citation[];
  streaming: boolean;
}

/// The digest is rendered as an outline rather than a wall of prose: headings
/// and one-line gists are always visible, and the quotes behind each point open
/// on demand. A reader in a hurry can take the whole thread from the headings.
export function DigestReader(props: Props) {
  const { markdown, citations, streaming } = props;
  const thread = useApp((state) => state.thread);
  const jumpToComment = useApp((state) => state.jumpToComment);

  const parsed = useMemo(() => parseDigest(markdown), [markdown]);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [allOpen, setAllOpen] = useState(false);

  // Thread length is the honest comparison: what reading it yourself would cost.
  const threadWords = useMemo(() => {
    if (!thread) {
      return 0;
    }
    let total = 0;
    const walk = (nodes: typeof thread.comments) => {
      for (const node of nodes) {
        total += countWords(node.text);
        walk(node.children);
      }
    };
    walk(thread.comments);
    return total;
  }, [thread]);

  const digestMinutes = minutes(countWords(markdown));
  const threadMinutes = minutes(threadWords);

  // Only the point being written stays open. Holding every section open until
  // the run ends and then collapsing them all at once made a finished digest
  // look like it had thrown its work away; folding each one as the model moves
  // past it settles the page a section at a time, and leaves nothing to snap
  // shut at the end but the last one.
  const isOpen = (index: number) =>
    streaming ? index === parsed.sections.length - 1 : open.has(index);

  const toggle = (index: number) => {
    const next = new Set(open);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setOpen(next);
  };

  const setEvery = (expand: boolean) => {
    setAllOpen(expand);
    setOpen(expand ? new Set(parsed.sections.map((_, index) => index)) : new Set());
  };

  // A model that ignores the format still has to render.
  if (parsed.sections.length === 0) {
    return (
      <Markdown source={markdown} citations={citations} onJump={(id) => jumpToComment(id)} />
    );
  }

  return (
    <div className="digest">
      <div className="digest-top">
        {parsed.verdict ? (
          <div className={`verdict verdict-${parsed.verdict}`}>
            <span className="verdict-label">{verdictLabel(parsed.verdict)}</span>
            {parsed.verdictReason ? (
              <span className="verdict-reason">{parsed.verdictReason}</span>
            ) : null}
          </div>
        ) : null}

        <div className="digest-meta">
          {streaming ? (
            <span>
              {parsed.sections.length} {parsed.sections.length === 1 ? "point" : "points"} so far…
            </span>
          ) : (
            <>
              <Tooltip label="Reading this digest versus reading every comment yourself">
                <span>
                  {digestMinutes} min here · {threadMinutes} min in the thread
                </span>
              </Tooltip>
              <span className="dot">·</span>
              <span>{parsed.sections.length} points</span>
            </>
          )}
          <div className="spacer" />
          {streaming ? null : (
            <button type="button" className="ghost-button" onClick={() => setEvery(!allOpen)}>
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          )}
        </div>
      </div>

      {parsed.preamble ? (
        <div className="digest-preamble">
          <Markdown source={parsed.preamble} citations={citations} />
        </div>
      ) : null}

      <ol className="digest-sections">
        {parsed.sections.map((section, index) => {
          const expanded = isOpen(index);
          return (
            <li key={index} className={`digest-section ${expanded ? "open" : ""}`}>
              <button
                type="button"
                className="digest-head"
                aria-expanded={expanded}
                disabled={streaming}
                onClick={() => toggle(index)}
              >
                <span className="digest-index">{index + 1}</span>
                <span className="digest-heading-text">
                  <span className="digest-heading">{section.heading}</span>
                  {section.gist ? <span className="digest-gist">{section.gist}</span> : null}
                </span>
                <span className="digest-toggle">
                  {section.quoteCount > 0 ? (
                    <span className="digest-count">
                      {section.quoteCount} {section.quoteCount === 1 ? "quote" : "quotes"}
                    </span>
                  ) : null}
<ChevronDown size={13} strokeWidth={2} />
                </span>
              </button>

              {expanded && section.body ? (
                <div className="digest-body" data-selection-source="digest">
                  <Markdown
                    source={section.body}
                    citations={citations}
                    onJump={(id) => jumpToComment(id)}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
