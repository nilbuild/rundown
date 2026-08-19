import type { ReactNode } from "react";
import { Menu as Base } from "@base-ui-components/react/menu";

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
}

export function Menu(props: Props) {
  const { trigger, entries, footer, ariaLabel, align } = props;

  const render = (entry: MenuEntry) => (
    <Base.Item
      key={entry.id}
      className={`ui-menu-item ${entry.danger ? "danger" : ""}`}
      onClick={entry.onSelect}
    >
      <span className="ui-menu-label">{entry.label}</span>
      {entry.hint ? <span className="ui-menu-hint">{entry.hint}</span> : null}
    </Base.Item>
  );

  return (
    <Base.Root>
      <Base.Trigger
        className="ui-menu-trigger"
        aria-label={ariaLabel}
        render={<button type="button" />}
      >
        {trigger}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner className="ui-layer" side="top" align={align ?? "start"} sideOffset={8}>
          <Base.Popup className="ui-menu-popup">
            {entries.map(render)}
            {footer && footer.length > 0 ? (
              <>
                <div className="ui-menu-sep" />
                {footer.map(render)}
              </>
            ) : null}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
