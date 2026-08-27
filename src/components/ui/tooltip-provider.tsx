import type { ReactNode } from "react";
import { Tooltip as Base } from "@base-ui-components/react/tooltip";

export function TooltipProvider(props: { children: ReactNode }) {
  const { children } = props;
  return <Base.Provider delay={350}>{children}</Base.Provider>;
}
