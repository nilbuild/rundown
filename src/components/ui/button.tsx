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

export function IconButton(props: Props) {
  const { className, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex size-[26px] shrink-0 items-center justify-center rounded-[7px] border border-line bg-line-soft text-xs leading-none text-muted transition-[background,border-color,color] duration-[120ms] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--line))] hover:bg-line hover:text-fg",
        className,
      )}
      {...rest}
    />
  );
}

export function PrimaryButton(props: Props & { small?: boolean }) {
  const { className, small, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "rounded-lg bg-accent text-[13px] font-[550] text-white transition-[filter] duration-[120ms] not-disabled:hover:brightness-110 disabled:cursor-default disabled:opacity-40",
        small ? "rounded-[7px] px-3.5 py-[5px] text-[12.5px]" : "px-[15px] py-[7px]",
        className,
      )}
      {...rest}
    />
  );
}

/// An accent-coloured text button. The underline is a border so it sits a
/// little clear of the descenders.
export function LinkButton(props: Props) {
  const { className, type, ...rest } = props;
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "border-b border-accent-soft text-accent no-underline hover:border-b-accent",
        className,
      )}
      {...rest}
    />
  );
}
