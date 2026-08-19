import { PreviewCard } from "@base-ui-components/react/preview-card";
import { useApp } from "../state/app";
import { isoAgo } from "../lib/format";
import type { Comment } from "../lib/types";

function findComment(nodes: Comment[], id: number): Comment | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const hit = findComment(node.children, id);
    if (hit) {
      return hit;
    }
  }
  return null;
}

interface Props {
  commentIds: number[];
}

/// An unnumbered source marker. There is no footnote list to point into, so a
/// number would carry no information — all it has to say is "there is a source
/// here, and you can see it without leaving the sentence".
export function Footnote(props: Props) {
  const { commentIds } = props;
  const thread = useApp((state) => state.thread);
  const jumpToComment = useApp((state) => state.jumpToComment);

  const found = thread
    ? commentIds.map((id) => ({ id, comment: findComment(thread.comments, id) }))
    : [];
  const missing = found.filter((entry) => !entry.comment).length;
  const resolved = found.filter((entry) => entry.comment);

  if (resolved.length === 0) {
    return (
      <span className="src src-missing" title="No comment with this id in the thread">
        ●
      </span>
    );
  }

  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        render={
          <span
            className={`src ${missing > 0 ? "src-partial" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={`${resolved.length} source${resolved.length === 1 ? "" : "s"}`}
            onClick={() => jumpToComment(resolved[0].id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                jumpToComment(resolved[0].id);
              }
            }}
          />
        }
      >
        {resolved.length > 1 ? resolved.length : "●"}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner className="ui-layer" sideOffset={8}>
          <PreviewCard.Popup className="src-card">
            {resolved.map(({ id, comment }) => (
              <article key={id} className="src-entry">
                <div className="src-head">
                  <span className="author">{comment!.author ?? "unknown"}</span>
                  <span className="muted">{isoAgo(comment!.created_at)}</span>
                  <button type="button" className="link" onClick={() => jumpToComment(id)}>
                    Go to comment
                  </button>
                </div>
                <p className="src-text">{comment!.text}</p>
              </article>
            ))}
            {missing > 0 ? (
              <p className="src-missing-note">
                {missing} cited {missing === 1 ? "source is" : "sources are"} not in this thread.
              </p>
            ) : null}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
