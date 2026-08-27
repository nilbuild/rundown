import type { ReactNode } from "react";
import { Tooltip as Base } from "@base-ui-components/react/tooltip";

interface Props {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

/// Replaces the `title` attribute, which takes a second to appear and renders
/// as OS chrome that ignores the app's theme.
export function Tooltip(props: Props) {
  const { label, children, side } = props;
  return (
    <Base.Root>
      <Base.Trigger render={<span className="inline-flex" />}>{children}</Base.Trigger>
      <Base.Portal>
        <Base.Positioner className="z-300" side={side ?? "bottom"} sideOffset={6}>
          <Base.Popup
            className="max-w-80 rounded-[7px] bg-fg px-[9px] py-[5px] text-[11.5px] leading-[1.35] font-medium whitespace-pre-line text-panel shadow-panel transition-[opacity,transform] duration-[120ms] ease-out origin-(--transform-origin) data-[ending-style]:scale-96 data-[ending-style]:opacity-0 data-[starting-style]:scale-96 data-[starting-style]:opacity-0"
          >
            {label}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
