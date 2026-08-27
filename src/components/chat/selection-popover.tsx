import { useEffect, useRef, useState } from "react";
import { useApp } from "~/stores/app";

interface Anchor {
  top: number;
  left: number;
  text: string;
  source: string;
  commentId?: number;
  author?: string;
}

function describe(node: Node | null) {
  let element = node instanceof Element ? node : node?.parentElement ?? null;
  while (element) {
    const source = element.getAttribute("data-selection-source");
    if (source) {
      const commentId = element.getAttribute("data-comment-id");
      const author = element.getAttribute("data-author");
      return {
        source,
        commentId: commentId ? Number(commentId) : undefined,
        author: author ?? undefined,
      };
    }
    element = element.parentElement;
  }
  return null;
}

export function SelectionPopover() {
  const setSelection = useApp((state) => state.setSelection);
  const sendChat = useApp((state) => state.sendChat);
  const setChatOpen = useApp((state) => state.setChatOpen);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseUp(event: MouseEvent) {
      if (popoverRef.current?.contains(event.target as Node)) {
        return;
      }

      window.setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          setAnchor(null);
          return;
        }

        const text = selection.toString().trim();
        if (text.length < 12) {
          setAnchor(null);
          return;
        }

        const context = describe(selection.anchorNode);
        if (!context) {
          setAnchor(null);
          return;
        }

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) {
          setAnchor(null);
          return;
        }

        setAnchor({
          top: rect.top - 8,
          left: rect.left + rect.width / 2,
          text,
          source: context.source,
          commentId: context.commentId,
          author: context.author,
        });
      }, 10);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAnchor(null);
      }
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  if (!anchor) {
    return null;
  }

  const commit = () => {
    setSelection({
      text: anchor.text,
      source: anchor.source,
      commentId: anchor.commentId,
      author: anchor.author,
    });
  };

  const ask = (question: string) => {
    commit();
    setChatOpen(true);
    window.setTimeout(() => sendChat(question), 0);
    window.getSelection()?.removeAllRanges();
    setAnchor(null);
  };

  return (
    <div
      ref={popoverRef}
      className="selection-popover"
      style={{ top: anchor.top, left: anchor.left }}
    >
      <button type="button" onClick={() => ask("What does this mean, and why does it matter here?")}>
        Explain
      </button>
      <button type="button" onClick={() => ask("Is this right? Push back on it if it is not.")}>
        Challenge
      </button>
      <button
        type="button"
        onClick={() => {
          commit();
          setChatOpen(true);
          setAnchor(null);
        }}
      >
        Ask…
      </button>
    </div>
  );
}
