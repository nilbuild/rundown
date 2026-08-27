import type { ReactNode } from "react";
import { Menu as Base } from "@base-ui-components/react/menu";
import { cn } from "~/utils/classname";

export interface MenuEntry {
  id: string;
  label: string;
  hint?: string;
  danger?: boolean;
  onSelect: () => void;
}

interface Props {
  trigger: ReactNode;
  entries: MenuEntry[];
  footer?: MenuEntry[];
  ariaLabel: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
}

export function Menu(props: Props) {
  const { trigger, entries, footer, ariaLabel, align, side } = props;

  const render = (entry: MenuEntry) => (
    <Base.Item
      key={entry.id}
      className="group flex cursor-default flex-col gap-0.5 rounded-[7px] px-[10px] py-[7px] outline-none select-none data-[highlighted]:bg-accent-soft"
      onClick={entry.onSelect}
    >
      <span
        className={cn(
          "text-[12.5px] font-[550] text-fg",
          entry.danger
            ? "group-data-[highlighted]:text-bad"
            : "group-data-[highlighted]:text-accent",
        )}
      >
        {entry.label}
      </span>
      {entry.hint ? (
        <span className="line-clamp-2 text-[11.5px] leading-[1.45] text-muted">{entry.hint}</span>
      ) : null}
    </Base.Item>
  );

  return (
    <Base.Root>
      <Base.Trigger
        // Sits next to ghost-button and icon-button in every toolbar that uses
        // it, so it has to carry their height rather than its own.
        className="inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border border-line px-[10px] text-xs text-fg-soft transition-[color,border-color] duration-[120ms] hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] hover:text-fg data-[popup-open]:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] data-[popup-open]:text-fg"
        aria-label={ariaLabel}
        render={<button type="button" />}
      >
        {trigger}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner
          className="ui-layer"
          side={side ?? "top"}
          align={align ?? "start"}
          sideOffset={8}
        >
          {/* A menu with no ceiling grows past the viewport, and the entries
              below the fold cannot be reached at all. Base UI publishes the room
              it actually has as --available-height; the vh is the fallback. */}
          <Base.Popup className="max-h-[min(var(--available-height,70vh),520px)] w-[300px] max-w-[78vw] origin-(--transform-origin) overflow-y-auto overscroll-contain rounded-[10px] border border-line bg-panel p-1 shadow-panel outline-none transition-[opacity,transform] duration-[120ms] data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[starting-style]:scale-97 data-[starting-style]:opacity-0">
            {entries.map(render)}
            {footer && footer.length > 0 ? (
              <>
                <div className="mx-1.5 my-1 h-px bg-line-soft" />
                {footer.map(render)}
              </>
            ) : null}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
