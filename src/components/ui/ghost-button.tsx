import type { ButtonHTMLAttributes } from "react";
import { cn } from "~/utils/classname";

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

/// Reads as plain text until you hover it, which is no use if you are looking
/// for the control rather than already pointing at it. It carries its own
/// surface at rest.
export function GhostButton(props: Props & { active?: boolean; danger?: boolean }) {
  const { className, active, danger, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center gap-[5px] rounded-[7px] border border-line bg-line-soft px-2.5 py-1 text-xs leading-[1.35] text-fg-soft transition-[background,border-color,color] duration-[120ms]",
        "not-disabled:hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] not-disabled:hover:bg-line not-disabled:hover:text-fg",
        "disabled:cursor-default disabled:opacity-45",
        active && "bg-accent-soft text-accent",
        danger && "hover:text-bad",
        className,
      )}
      {...rest}
    />
  );
}
