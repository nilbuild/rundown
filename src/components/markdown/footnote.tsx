import { PreviewCard } from "@base-ui-components/react/preview-card";
import { useApp } from "~/stores/app";
import { isoAgo } from "~/utils/format";
import type { Comment } from "~/types";
import { LinkButton } from "~/components/ui/button";
import { cn } from "~/utils/classname";

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
      <span
        className="ml-[3px] inline-block h-[13px] min-w-[13px] cursor-pointer rounded-[7px] bg-accent-soft px-[3px] text-center align-[4px] font-ui text-[8.5px] leading-[13px] font-bold text-accent select-none transition-[background,color] duration-[120ms] hover:bg-accent hover:text-white data-[popup-open]:bg-accent data-[popup-open]:text-white cursor-help bg-[color-mix(in_srgb,var(--bad)_18%,transparent)] text-bad hover:bg-[color-mix(in_srgb,var(--bad)_18%,transparent)] hover:text-bad"
        title="No comment with this id in the thread"
      >
        ●
      </span>
    );
  }

  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        render={
          <span
            className={cn(
              "ml-[3px] inline-block h-[13px] min-w-[13px] cursor-pointer rounded-[7px] bg-accent-soft px-[3px] text-center align-[4px] font-ui text-[8.5px] leading-[13px] font-bold text-accent select-none transition-[background,color] duration-[120ms] hover:bg-accent hover:text-white data-[popup-open]:bg-accent data-[popup-open]:text-white",
              missing > 0 && "shadow-[inset_0_0_0_1px_var(--bad)]",
            )}
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
        <PreviewCard.Positioner className="z-300" sideOffset={8}>
          <PreviewCard.Popup className="max-h-[340px] w-[360px] max-w-[82vw] origin-(--transform-origin) overflow-y-auto rounded-[10px] border border-line bg-panel p-1 shadow-panel transition-[opacity,transform] duration-[140ms] data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[starting-style]:scale-97 data-[starting-style]:opacity-0">
            {resolved.map(({ id, comment }) => (
              <article
                key={id}
                className="rounded-[7px] px-[11px] py-[9px] [&+&]:rounded-none [&+&]:border-t [&+&]:border-line-soft"
              >
                <div className="mb-[5px] flex items-center gap-2 text-[11.5px]">
                  <span className="font-semibold">{comment!.author ?? "unknown"}</span>
                  <span className="text-muted">{isoAgo(comment!.created_at)}</span>
                  <LinkButton onClick={() => jumpToComment(id)}>
                    Go to comment
                  </LinkButton>
                </div>
                <p className="m-0 text-[12.5px] leading-[1.55] whitespace-pre-wrap text-fg-soft">{comment!.text}</p>
              </article>
            ))}
            {missing > 0 ? (
              <p className="m-0 px-[11px] py-2 text-[11.5px] text-bad">
                {missing} cited {missing === 1 ? "source is" : "sources are"} not in this thread.
              </p>
            ) : null}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
