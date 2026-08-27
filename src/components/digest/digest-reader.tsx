import { useMemo, useState } from "react";
import { useApp } from "~/stores/app";
import { Markdown } from "~/components/markdown/markdown";
import { Tooltip } from "~/components/ui/tooltip";
import { countWords, minutes, parseDigest, verdictLabel } from "~/utils/digest";
import type { Citation } from "~/types";
import { ChevronDown } from "lucide-react";
import { GhostButton } from "~/components/ui/button";
import { cn } from "~/utils/classname";

interface Props {
  markdown: string;
  citations?: Citation[];
  streaming: boolean;
}

/// The digest is rendered as an outline rather than a wall of prose: headings
/// and one-line gists are always visible, and the quotes behind each point open
/// on demand. A reader in a hurry can take the whole thread from the headings.
const VERDICT_TONE: Record<string, string> = {
  read: "bg-[color-mix(in_srgb,var(--good)_11%,transparent)] border-[color-mix(in_srgb,var(--good)_30%,transparent)] [&_[data-verdict-label]]:text-good",
  skim: "bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] border-[color-mix(in_srgb,var(--accent)_28%,transparent)] [&_[data-verdict-label]]:text-accent",
  skip: "bg-line-soft border-line [&_[data-verdict-label]]:text-muted",
};

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
    <div>
      <div className="mb-[26px] flex flex-col gap-3">
        {parsed.verdict ? (
          <div
            className={cn(
              "flex flex-wrap items-baseline gap-x-2.5 gap-y-1 rounded-[10px] border px-3.5 py-[11px] text-[13px] leading-[1.5]",
              VERDICT_TONE[parsed.verdict],
            )}
          >
            <span data-verdict-label className="font-semibold whitespace-nowrap">{verdictLabel(parsed.verdict)}</span>
            {parsed.verdictReason ? (
              <span className="text-fg-soft">{parsed.verdictReason}</span>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-2 text-xs text-muted [&_.dot]:opacity-50">
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
          <div className="flex-1" />
          {streaming ? null : (
            <GhostButton onClick={() => setEvery(!allOpen)}>
              {allOpen ? "Collapse all" : "Expand all"}
            </GhostButton>
          )}
        </div>
      </div>

      {parsed.preamble ? (
        <div className="mb-[22px] text-[13.5px] text-muted">
          <Markdown source={parsed.preamble} citations={citations} />
        </div>
      ) : null}

      <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
        {parsed.sections.map((section, index) => {
          const expanded = isOpen(index);
          return (
            <li
              key={index}
              data-open={expanded || undefined}
              className={cn(
                "group/section rounded-[10px] transition-[background] duration-[120ms]",
                expanded ? "bg-panel-2" : "hover:bg-line-soft",
              )}
            >
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3.5 py-[13px] text-left disabled:cursor-default"
                aria-expanded={expanded}
                disabled={streaming}
                onClick={() => toggle(index)}
              >
                <span className="w-[18px] shrink-0 pt-0.5 text-[11.5px] text-muted tabular-nums">{index + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[14.5px] leading-[1.35] font-semibold tracking-[-0.008em] text-fg">{section.heading}</span>
                  {section.gist ? <span className="text-[13px] leading-[1.5] text-fg-soft">{section.gist}</span> : null}
                </span>
                <span className="flex shrink-0 items-center gap-2 pt-[3px] text-[11px] text-muted [&_svg]:transition-transform [&_svg]:duration-[160ms] group-data-open/section:[&_svg]:rotate-180">
                  {section.quoteCount > 0 ? (
                    <span className="whitespace-nowrap opacity-0 transition-opacity duration-[120ms] group-hover/section:opacity-100 group-data-open/section:opacity-100">
                      {section.quoteCount} {section.quoteCount === 1 ? "quote" : "quotes"}
                    </span>
                  ) : null}
<ChevronDown size={13} strokeWidth={2} />
                </span>
              </button>

              {expanded && section.body ? (
                <div className="px-3.5 pt-0 pb-4 pl-11 text-sm leading-[1.62] [&_.md_blockquote]:mb-[0.5em] [&_.md_blockquote]:border-l-2 [&_.md_blockquote]:border-accent [&_.md_blockquote]:py-0.5 [&_.md_blockquote]:pl-4 [&_.md_blockquote]:font-serif [&_.md_blockquote]:text-[15px] [&_.md_blockquote]:leading-[1.55] [&_.md_blockquote]:text-fg [&_.md_blockquote_p]:m-0" data-selection-source="digest">
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
