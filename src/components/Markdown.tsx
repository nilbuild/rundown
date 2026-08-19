import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { openExternal } from "../lib/api";
import { Footnote } from "./Footnote";
import type { Citation, CitationStatus } from "../lib/types";

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

export function Markdown(props: Props) {
  const { source, citations, onJump, className, footnotes } = props;

  return (
    <div className={`md ${className ?? ""}`}>
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
                  className={`cite ${status ? `cite-${status}` : ""}`}
                  title={status ? statusLabel(status) : "Jump to this comment"}
                  onClick={() => onJump?.(commentId)}
                >
                  {children}
                  {flagged ? <span className="cite-flag">unverified</span> : null}
                  {status === "loose" ? <span className="cite-soft">≈</span> : null}
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
