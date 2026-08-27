import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { openExternal } from "~/lib/api/shell";
import { Footnote } from "~/components/markdown/footnote";
import type { Citation, CitationStatus } from "~/lib/api/outputs";
import { cn } from "~/utils/classname";

interface Props {
  source: string;
  citations?: Citation[];
  onJump?: (commentId: number) => void;
  className?: string;
  /// Render `[n](hn:id)` as a superscript source marker instead of an inline
  /// author chip. Used by the briefing, where sources are footnotes.
  footnotes?: boolean;
}

const PROBLEM: CitationStatus[] = ["mismatch", "unknown", "wrongauthor"];
const SAFE_SCHEME = /^(https?:|mailto:)/i;
const SAFE_IMAGE = /^(https?:|data:image\/)/i;

function worstStatus(citations: Citation[], commentId: number) {
  const matching = citations.filter((citation) => citation.commentId === commentId);
  if (matching.length === 0) {
    return null;
  }
  const problem = matching.find((citation) => PROBLEM.includes(citation.status));
  if (problem) {
    return problem.status;
  }
  const loose = matching.find((citation) => citation.status === "loose");
  if (loose) {
    return "loose" as CitationStatus;
  }
  return "exact" as CitationStatus;
}

function statusLabel(status: CitationStatus) {
  if (status === "exact") {
    return "Quote verified against this comment";
  }
  if (status === "loose") {
    return "Quote found, but shortened or reflowed";
  }
  if (status === "mismatch") {
    return "This quote is not in that comment — check it before using it";
  }
  if (status === "wrongauthor") {
    return "The quote exists but is attributed to the wrong person";
  }
  return "No comment with this id in the thread";
}

const MD =
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:mb-[0.85em] [&_ul]:mb-[0.9em] [&_ul]:pl-[1.35em] [&_ol]:mb-[0.9em] [&_ol]:pl-[1.35em] [&_li]:mb-[0.3em] [&_code]:rounded [&_code]:bg-line-soft [&_code]:px-[5px] [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.87em] [&_pre]:mb-[1em] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-panel-2 [&_pre]:px-3.5 [&_pre]:py-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-xs [&_pre_code]:leading-[1.55] [&_table]:mb-[1em] [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px] [&_th]:border [&_th]:border-line [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_td]:border [&_td]:border-line [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:text-left [&_hr]:my-[1.6em] [&_hr]:border-t [&_hr]:border-line [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_img]:bg-line-soft [&_p>img:only-child]:my-[0.4em] [&_p>img:only-child]:block [&_figure]:my-[1.2em] [&_figcaption]:mt-1.5 [&_figcaption]:font-ui [&_figcaption]:text-xs [&_figcaption]:text-muted [&_a]:border-b [&_a]:border-accent-soft [&_a]:text-accent [&_a]:no-underline [&_a:hover]:border-b-accent [&_.hljs-keyword]:text-(--hl-key) [&_.hljs-selector-tag]:text-(--hl-key) [&_.hljs-literal]:text-(--hl-key) [&_.hljs-doctag]:text-(--hl-key) [&_.hljs-string]:text-(--hl-str) [&_.hljs-regexp]:text-(--hl-str) [&_.hljs-addition]:text-(--hl-str) [&_.hljs-attribute]:text-(--hl-str) [&_.hljs-number]:text-(--hl-num) [&_.hljs-bullet]:text-(--hl-num) [&_.hljs-symbol]:text-(--hl-num) [&_.hljs-comment]:text-(--hl-com) [&_.hljs-comment]:italic [&_.hljs-quote]:text-(--hl-com) [&_.hljs-quote]:italic [&_.hljs-meta]:text-(--hl-com) [&_.hljs-meta]:italic [&_.hljs-title]:text-(--hl-fn) [&_.hljs-section]:text-(--hl-fn) [&_.hljs-name]:text-(--hl-fn) [&_.hljs-type]:text-(--hl-type) [&_.hljs-built_in]:text-(--hl-type) [&_.hljs-variable]:text-(--hl-type) [&_.hljs-template-variable]:text-(--hl-type) [&_.hljs-emphasis]:italic [&_.hljs-strong]:font-semibold";

export function Markdown(props: Props) {
  const { source, citations, onJump, className, footnotes } = props;

  return (
    <div className={cn("md", MD, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        urlTransform={(url) => url}
        components={{
          a(anchorProps) {
            const { href, children } = anchorProps;

            if (href && href.startsWith("hn:")) {
              const commentId = Number(href.slice(3));

              if (footnotes) {
                const ids = href
                  .slice(3)
                  .split(",")
                  .map((part) => Number(part.trim()))
                  .filter((id) => Number.isFinite(id) && id > 0);
                return <Footnote commentIds={ids.length > 0 ? ids : [commentId]} />;
              }

              const status = citations ? worstStatus(citations, commentId) : null;
              const flagged = status ? PROBLEM.includes(status) : false;

              return (
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-baseline gap-1 border-b border-accent-soft text-[0.95em] text-accent hover:border-b-accent",
                    status && status !== "loose" && "border-b-bad text-bad",
                  )}
                  title={status ? statusLabel(status) : "Jump to this comment"}
                  onClick={() => onJump?.(commentId)}
                >
                  {children}
                  {flagged ? <span className="rounded bg-bad px-[5px] py-px text-[9.5px] tracking-[0.05em] text-white uppercase">unverified</span> : null}
                  {status === "loose" ? <span className="text-[0.9em] text-muted">≈</span> : null}
                </button>
              );
            }

            // Comment bodies are untrusted, so only hand real web URLs to the OS.
            if (!href || !SAFE_SCHEME.test(href)) {
              return <span>{children}</span>;
            }

            return (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  openExternal(href);
                }}
              >
                {children}
              </a>
            );
          },

          img(imageProps) {
            const { src, alt, title } = imageProps;
            if (typeof src !== "string" || !SAFE_IMAGE.test(src)) {
              return null;
            }
            return (
              <img
                src={src}
                alt={alt ?? ""}
                title={title}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  // A dead image should leave a gap, not a broken-file glyph.
                  event.currentTarget.style.display = "none";
                }}
              />
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
