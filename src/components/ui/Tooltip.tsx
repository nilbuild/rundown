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
      <Base.Trigger render={<span className="tip-anchor" />}>{children}</Base.Trigger>
      <Base.Portal>
        <Base.Positioner className="ui-layer" side={side ?? "bottom"} sideOffset={6}>
          <Base.Popup className="ui-tooltip">{label}</Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

export function TooltipProvider(props: { children: ReactNode }) {
  const { children } = props;
  return <Base.Provider delay={350}>{children}</Base.Provider>;
}
